# app.py
import os
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename

app = Flask(__name__)

# --- Database & File Storage Setup ---
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
ALLOWED_EXTENSIONS = set(['pdf','png','jpg','jpeg','doc','docx'])

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def init_db():
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('DROP TABLE IF EXISTS users')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            email TEXT
        )
        '''
    )
    users = [
        ('faculty1', 'pass1', 'faculty', 'faculty1@example.com'),
        ('student1', 'pass1', 'student', 'student1@example.com'),
    ]
    cursor.executemany('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?)', users)

    # Student Data table
    cursor.execute('DROP TABLE IF EXISTS student_data')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS student_data (
            username TEXT PRIMARY KEY,
            attendance_totalDays INTEGER DEFAULT 0,
            attendance_attendedDays INTEGER DEFAULT 0,
            FOREIGN KEY(username) REFERENCES users(username)
        )
        '''
    )
    cursor.execute('INSERT OR IGNORE INTO student_data (username) VALUES (?)', ('student1',))

    # Marks table
    cursor.execute('DROP TABLE IF EXISTS marks')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS marks (
            id INTEGER PRIMARY KEY,
            student_username TEXT,
            subject TEXT,
            marks INTEGER,
            FOREIGN KEY(student_username) REFERENCES users(username)
        )
        '''
    )

    # Assignments table
    cursor.execute('DROP TABLE IF EXISTS assignments')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY,
            assignment_name TEXT NOT NULL,
            details TEXT NOT NULL
        )
        '''
    )

    # Submissions table
    cursor.execute('DROP TABLE IF EXISTS submissions')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY,
            assignment_id INTEGER,
            student_username TEXT,
            file_path TEXT,
            remarks TEXT,
            FOREIGN KEY(assignment_id) REFERENCES assignments(id),
            FOREIGN KEY(student_username) REFERENCES users(username)
        )
        '''
    )

    # Certificates table (non-academic uploads)
    cursor.execute('DROP TABLE IF EXISTS certificates')
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY,
            student_username TEXT,
            file_path TEXT,
            status TEXT DEFAULT 'pending',
            remarks TEXT,
            uploaded_at TEXT,
            FOREIGN KEY(student_username) REFERENCES users(username)
        )
        '''
    )
    
    conn.commit()
    conn.close()

# --- API Endpoints ---
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/create_account', methods=['POST'])
def create_account():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')
    email = data.get('email')

    if not all([username, password, role, email]):
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()

    try:
        cursor.execute('INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)', (username, password, role.lower(), email))
        if role.lower() == 'student':
            cursor.execute('INSERT OR IGNORE INTO student_data (username) VALUES (?)', (username,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Account created successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'Username already exists'}), 409
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('SELECT password, role FROM users WHERE username = ?', (username,))
    user_data = cursor.fetchone()
    conn.close()

    if user_data is None:
        return jsonify({'success': False, 'message': 'Invalid username'}), 401
    
    db_password, db_role = user_data
    
    if db_password != password:
        return jsonify({'success': False, 'message': 'Invalid password'}), 401
    
    if db_role.lower() != role.lower():
        return jsonify({'success': False, 'message': f'User is not a {role}'}), 401

    return jsonify({'success': True, 'role': db_role})

# --- Assignments & Submissions (existing) ---
@app.route('/assignments', methods=['POST'])
def create_assignment():
    data = request.json
    name = data.get('name')
    details = data.get('details')

    if not all([name, details]):
        return jsonify({'success': False, 'message': 'Missing assignment details'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO assignments (assignment_name, details) VALUES (?, ?)', (name, details))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Assignment created'}), 201

@app.route('/assignments', methods=['GET'])
def get_assignments():
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id, assignment_name, details FROM assignments')
    assignments = [{'id': row[0], 'name': row[1], 'details': row[2]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(assignments)

@app.route('/submit_assignment/<int:assignment_id>', methods=['POST'])
def submit_assignment(assignment_id):
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400

    file = request.files['file']
    student_username = request.form.get('student_username')
    if not student_username or file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file or student username'}), 400

    filename = secure_filename(f"{student_username}_{assignment_id}_{file.filename}")
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO submissions (assignment_id, student_username, file_path) VALUES (?, ?, ?)', (assignment_id, student_username, file_path))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'File uploaded successfully', 'file_path': file_path})

@app.route('/submissions', methods=['GET'])
def get_submissions():
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT s.id, a.assignment_name, s.student_username, s.file_path, s.remarks
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
    ''')
    submissions = [{'id': row[0], 'assignment_name': row[1], 'student_username': row[2], 'file_path': row[3], 'remarks': row[4]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(submissions)

@app.route('/submission_remarks/<int:submission_id>', methods=['PUT'])
def add_remarks(submission_id):
    data = request.json
    remarks = data.get('remarks')
    
    if not remarks:
        return jsonify({'success': False, 'message': 'Missing remarks'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE submissions SET remarks = ? WHERE id = ?', (remarks, submission_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Remarks updated successfully'})

# --- Marks endpoints ---
@app.route('/student/<username>/marks', methods=['GET'])
def get_student_marks(username):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('SELECT subject, marks FROM marks WHERE student_username = ?', (username,))
    marks = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    return jsonify(marks)

@app.route('/marks', methods=['POST'])
def upsert_marks():
    data = request.json
    student_username = data.get('student_username')
    subject = data.get('subject')
    marks = data.get('marks')

    if not all([student_username, subject]) or marks is None:
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    # update if exists, else insert
    cursor.execute('SELECT id FROM marks WHERE student_username = ? AND subject = ?', (student_username, subject))
    existing = cursor.fetchone()
    if existing:
        cursor.execute('UPDATE marks SET marks = ? WHERE id = ?', (marks, existing[0]))
    else:
        cursor.execute('INSERT INTO marks (student_username, subject, marks) VALUES (?, ?, ?)', (student_username, subject, marks))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Marks saved'})

# --- Attendance endpoints ---
@app.route('/student/<username>/attendance', methods=['GET'])
def get_attendance(username):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('SELECT attendance_totalDays, attendance_attendedDays FROM student_data WHERE username = ?', (username,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify({'totalDays': row[0], 'attendedDays': row[1]})
    else:
        return jsonify({'totalDays': 0, 'attendedDays': 0})

@app.route('/student/<username>/attendance', methods=['PUT'])
def update_attendance(username):
    data = request.json
    total = data.get('totalDays')
    attended = data.get('attendedDays')

    if total is None or attended is None:
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('INSERT OR REPLACE INTO student_data (username, attendance_totalDays, attendance_attendedDays) VALUES (?, ?, ?)', (username, total, attended))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Attendance updated'})

# --- Certificates (non-academic) endpoints ---
@app.route('/upload_certificate', methods=['POST'])
def upload_certificate():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400
    file = request.files['file']
    student_username = request.form.get('student_username')
    if not student_username or file.filename == '':
        return jsonify({'success': False, 'message': 'Missing student username or file'}), 400
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'File type not allowed'}), 400

    filename = secure_filename(f"{student_username}_cert_{int(datetime.utcnow().timestamp())}_{file.filename}")
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO certificates (student_username, file_path, status, uploaded_at) VALUES (?, ?, ?, ?)', (student_username, file_path, 'pending', datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Certificate uploaded', 'file_path': file_path}), 201

@app.route('/certificates', methods=['GET'])
def list_certificates():
    role = request.args.get('role')
    username = request.args.get('username')
    status = request.args.get('status')  # optional

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    if role == 'student' and username:
        if status:
            cursor.execute('SELECT id, file_path, status, remarks, uploaded_at FROM certificates WHERE student_username = ? AND status = ?', (username, status))
        else:
            cursor.execute('SELECT id, file_path, status, remarks, uploaded_at FROM certificates WHERE student_username = ?', (username,))
        rows = cursor.fetchall()
        conn.close()
        return jsonify([{'id': r[0], 'file_path': r[1], 'status': r[2], 'remarks': r[3], 'uploaded_at': r[4]} for r in rows])
    elif role == 'faculty':
        # faculty can filter by status (e.g., pending)
        if status:
            cursor.execute('SELECT id, student_username, file_path, status, remarks, uploaded_at FROM certificates WHERE status = ?', (status,))
        else:
            cursor.execute('SELECT id, student_username, file_path, status, remarks, uploaded_at FROM certificates')
        rows = cursor.fetchall()
        conn.close()
        return jsonify([{'id': r[0], 'student_username': r[1], 'file_path': r[2], 'status': r[3], 'remarks': r[4], 'uploaded_at': r[5]} for r in rows])
    else:
        conn.close()
        return jsonify({'success': False, 'message': 'Invalid query parameters'}), 400

@app.route('/certificates/<int:cert_id>/status', methods=['PUT'])
def update_certificate_status(cert_id):
    data = request.json
    status = data.get('status')  # approved/rejected/pending
    remarks = data.get('remarks', '')

    if status not in ('approved', 'rejected', 'pending'):
        return jsonify({'success': False, 'message': 'Invalid status'}), 400

    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE certificates SET status = ?, remarks = ? WHERE id = ?', (status, remarks, cert_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Certificate status updated'})

# Serve uploaded files (simple)
@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)
    except Exception:
        abort(404)

if __name__ == '__main__':
    #init_db()
    app.run(debug=True)
