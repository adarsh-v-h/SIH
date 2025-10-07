// script.js
let currentUser = null;
let currentRole = null;

async function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const role = document.getElementById('roleSelect').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const result = await response.json();

        if (response.ok) {
            currentUser = username;
            currentRole = result.role;

            // remove the "login-active" page-level class so CSS will show dashboard
            document.body.classList.remove('login-active');

            // show dashboard and hide login card
            document.getElementById('loginDiv').classList.add('hidden');
            document.getElementById('dashboardDiv').classList.remove('hidden');

            document.getElementById('welcomeMsg').textContent = `Welcome, ${currentUser} (${result.role})`;

            if (result.role === 'student') {
                showStudentDashboard();
            } else {
                showFacultyDashboard();
            }
        } else {
            errorEl.textContent = result.message;
        }
    } catch (error) {
        console.error('Error:', error);
        errorEl.textContent = 'An error occurred. Please try again.';
    }
}

function logout() {
    currentUser = null;
    currentRole = null;

    // show login again
    document.getElementById('loginDiv').classList.remove('hidden');
    document.getElementById('dashboardDiv').classList.add('hidden');
    document.getElementById('studentDashboard').classList.add('hidden');
    document.getElementById('facultyDashboard').classList.add('hidden');

    // re-enable centered login-page layout
    document.body.classList.add('login-active');
}


async function createAccount() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const role = document.getElementById('roleSelect').value;
  const email = document.getElementById('emailInput').value.trim();
  const confirmPassword = document.getElementById('confirmPasswordInput').value;

  if (password !== confirmPassword) {
    document.getElementById('loginError').textContent = 'Passwords do not match.';
    return;
  }

  try {
    const response = await fetch('/create_account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, email }),
    });
    const result = await response.json();
    document.getElementById('loginError').textContent = result.message;
    if (response.ok) {
        cancelCreateAccount();
    }
  } catch (error) {
    console.error('Error creating account:', error);
    document.getElementById('loginError').textContent = 'An error occurred.';
  }
}

function showCreateAccountForm() {
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('createAccountBtn').classList.add('hidden');
    document.getElementById('submitCreateBtn').classList.remove('hidden');
    document.getElementById('cancelCreateBtn').classList.remove('hidden');
    document.getElementById('emailInput').classList.remove('hidden');
    document.getElementById('confirmPasswordInput').classList.remove('hidden');
}

function cancelCreateAccount() {
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('createAccountBtn').classList.remove('hidden');
    document.getElementById('submitCreateBtn').classList.add('hidden');
    document.getElementById('cancelCreateBtn').classList.add('hidden');
    document.getElementById('emailInput').classList.add('hidden');
    document.getElementById('confirmPasswordInput').classList.add('hidden');
    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('emailInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    document.getElementById('loginError').textContent = '';
}

function showStudentDashboard() {
    document.getElementById('studentDashboard').classList.remove('hidden');
    showStudentSection('academics');
    fetchStudentAcademics();
    fetchStudentAssignments();
    fetchStudentCertificates();
}

function showFacultyDashboard() {
    document.getElementById('facultyDashboard').classList.remove('hidden');
    showFacultySection('manage-assignments');
    fetchFacultyAssignments();
    fetchFacultyCertificates();
}

// normalize section names (accept 'non-academics' and 'nonAcademics')
function studentSectionId(section) {
    if (!section) return null;
    const normalized = section.replace(/[-_ ]([a-z])/g, (m,p)=>p.toUpperCase());
    const cap = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return 'student' + cap + 'Section';
}

function showStudentSection(section) {
    document.querySelectorAll('#studentDashboard .dashboard-section').forEach(el => el.classList.add('hidden'));
    const id = studentSectionId(section);
    if (id && document.getElementById(id)) {
        document.getElementById(id).classList.remove('hidden');
    } else {
        console.warn('Missing section element for id', id);
    }
}

function showFacultySection(section) {
    document.querySelectorAll('#facultyDashboard .dashboard-section').forEach(el => el.classList.add('hidden'));
    const id = section.replace(/[-_ ]/g, '') + 'Section';
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

// ---------- STUDENT: Academics ----------
async function fetchStudentAcademics() {
    const attendanceDisplay = document.getElementById('attendanceDisplay');
    const marksList = document.getElementById('marksList');

    try {
        const attRes = await fetch(`/student/${currentUser}/attendance`);
        if (attRes.ok) {
            const att = await attRes.json();
            attendanceDisplay.textContent = `${att.attendedDays} / ${att.totalDays}`;
        } else {
            attendanceDisplay.textContent = 'N/A';
        }

        const marksRes = await fetch(`/student/${currentUser}/marks`);
        if (marksRes.ok) {
            const marks = await marksRes.json();
            marksList.innerHTML = Object.entries(marks).map(([subject, mark]) => `<li>${subject}: ${mark}</li>`).join('');
        } else {
            marksList.innerHTML = '<em>No marks available.</em>';
        }
    } catch (err) {
        console.error(err);
        attendanceDisplay.textContent = 'Error';
        marksList.innerHTML = '<em>Error fetching marks.</em>';
    }
}

// ---------- STUDENT: Non-Academics (Certificates) ----------
async function fetchStudentCertificates() {
    const list = document.getElementById('studentCertificatesList');
    if (!list) return;
    list.innerHTML = 'Loading...';
    try {
        const res = await fetch(`/certificates?role=student&username=${encodeURIComponent(currentUser)}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const certs = await res.json();
        if (certs.length === 0) {
            list.innerHTML = '<em>No certificates uploaded.</em>';
            return;
        }
        list.innerHTML = '';
        certs.forEach(c => {
            const div = document.createElement('div');
            div.className = 'submission';
            const filename = c.file_path.split('/').pop();
            div.innerHTML = `<strong>${filename}</strong> — <span class="status-${c.status}">${c.status}</span><br/>
                             Remarks: ${c.remarks || '—'}<br/>
                             <a href="${c.file_path}" target="_blank">Download</a>`;
            list.appendChild(div);
        });
    } catch (err) {
        console.error(err);
        list.innerHTML = '<em>Error loading certificates.</em>';
    }
}

async function uploadCertificate() {
    const input = document.getElementById('certificateFileInput');
    if (!input || input.files.length === 0) {
        alert('Please select a file first.');
        return;
    }
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('student_username', currentUser);

    try {
        const res = await fetch('/upload_certificate', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert('Certificate uploaded (status: pending).');
            input.value = '';
            fetchStudentCertificates();
        } else {
            alert(result.message || 'Upload failed.');
        }
    } catch (err) {
        console.error(err);
        alert('Upload error.');
    }
}

// ---------- FACULTY: Certificates approval ----------
async function fetchFacultyCertificates() {
    const container = document.getElementById('facultyCertificatesList');
    if (!container) return;
    container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`/certificates?role=faculty&status=pending`);
        if (!res.ok) throw new Error('Failed');
        const certs = await res.json();
        if (certs.length === 0) {
            container.innerHTML = '<em>No pending certificates.</em>';
            return;
        }
        container.innerHTML = '';
        certs.forEach(c => {
            const div = document.createElement('div');
            div.className = 'submission';
            const filename = c.file_path.split('/').pop();
            div.innerHTML = `<strong>${filename}</strong> — <b>${c.student_username}</b><br/>
                             <a href="${c.file_path}" target="_blank">Download</a><br/>
                             <textarea id="cert_remark_${c.id}" placeholder="Add remarks (optional)"></textarea><br/>
                             <button onclick="changeCertStatus(${c.id}, 'approved')">Approve</button>
                             <button onclick="changeCertStatus(${c.id}, 'rejected')">Reject</button>`;
            container.appendChild(div);
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = '<em>Error loading pending certificates.</em>';
    }
}

async function changeCertStatus(id, status) {
    const remarks = document.getElementById(`cert_remark_${id}`)?.value || '';
    try {
        const res = await fetch(`/certificates/${id}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status, remarks })
        });
        const result = await res.json();
        if (res.ok) {
            alert('Updated.');
            fetchFacultyCertificates();
        } else {
            alert(result.message || 'Update failed.');
        }
    } catch (err) {
        console.error(err);
        alert('Error updating certificate.');
    }
}

// ---------- FACULTY: Marks & Attendance ----------
async function updateMarks() {
    const student = document.getElementById('markStudentInput').value.trim();
    const subject = document.getElementById('markSubjectInput').value.trim();
    const mark = parseInt(document.getElementById('markValueInput').value, 10);
    if (!student || !subject || isNaN(mark)) {
        alert('Please fill student, subject and numeric marks.');
        return;
    }
    try {
        const res = await fetch('/marks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ student_username: student, subject, marks: mark })
        });
        const result = await res.json();
        if (res.ok) {
            alert('Marks saved.');
        } else {
            alert(result.message || 'Failed to save marks.');
        }
    } catch (err) {
        console.error(err);
        alert('Error saving marks.');
    }
}

async function updateAttendanceByFaculty() {
    const student = document.getElementById('attStudentInput').value.trim();
    const total = parseInt(document.getElementById('attTotalInput').value, 10);
    const attended = parseInt(document.getElementById('attAttendedInput').value, 10);
    if (!student || isNaN(total) || isNaN(attended)) {
        alert('Please fill student and numeric totals.');
        return;
    }
    try {
        const res = await fetch(`/student/${encodeURIComponent(student)}/attendance`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ totalDays: total, attendedDays: attended })
        });
        const result = await res.json();
        if (res.ok) {
            alert('Attendance updated.');
            fetchFacultyAssignments();
        } else {
            alert(result.message || 'Failed to update attendance.');
        }
    } catch (err) {
        console.error(err);
        alert('Error updating attendance.');
    }
}

// ---------- Assignments (unchanged) ----------
async function fetchStudentAssignments() {
    const assignmentsListStudent = document.getElementById('assignmentsListStudent');
    if (!assignmentsListStudent) return;
    assignmentsListStudent.innerHTML = '';
    const response = await fetch('/assignments');
    const assignments = await response.json();
    
    for (const assignment of assignments) {
        const div = document.createElement('div');
        div.innerHTML = `<h4>${assignment.name}</h4><p>${assignment.details}</p>`;
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Submit File';
        submitBtn.onclick = async () => {
            if (!fileInput.files[0]) { alert('Select a file first'); return; }
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('student_username', currentUser);
            
            await fetch(`/submit_assignment/${assignment.id}`, {
                method: 'POST',
                body: formData
            });
            alert('Assignment submitted!');
            fetchStudentAssignments();
        };
        
        div.appendChild(fileInput);
        div.appendChild(submitBtn);
        assignmentsListStudent.appendChild(div);
    }
}

async function fetchFacultyAssignments() {
    const submittedAssignmentsDiv = document.getElementById('submittedAssignmentsDiv');
    if (!submittedAssignmentsDiv) return;
    submittedAssignmentsDiv.innerHTML = 'Fetching submitted assignments...';
    
    const response = await fetch('/submissions');
    const submissions = await response.json();

    submittedAssignmentsDiv.innerHTML = '';
    
    if (submissions.length === 0) {
        submittedAssignmentsDiv.innerHTML = '<em>No submissions yet.</em>';
        return;
    }
    
    for (const submission of submissions) {
        const container = document.createElement('div');
        container.style.border = '1px solid #ccc';
        container.style.marginTop = '10px';
        container.style.padding = '10px';
        container.innerHTML = `
            <strong>Assignment: ${submission.assignment_name}</strong><br/>
            <b>Student: ${submission.student_username}</b><br/>
            <p>File: <a href="${submission.file_path}" target="_blank">Download File</a></p>
            <p>Remarks: <span id="remarks_${submission.id}">${submission.remarks || '(No remarks yet)'}</span></p>
            <button onclick="addRemarks(${submission.id})">Add/Edit Remarks</button>
        `;
        submittedAssignmentsDiv.appendChild(container);
    }
}

async function createAssignment() {
    const name = document.getElementById('assignmentNameInput').value;
    const details = document.getElementById('assignmentDetailsInput').value;

    if (!name || !details) {
        alert('Please fill in all fields.');
        return;
    }

    const response = await fetch('/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, details })
    });
    
    const result = await response.json();
    alert(result.message);
    if (response.ok) {
        document.getElementById('assignmentNameInput').value = '';
        document.getElementById('assignmentDetailsInput').value = '';
        fetchFacultyAssignments();
        fetchStudentAssignments();
    }
}

async function addRemarks(submissionId) {
    const remarks = prompt("Enter your remarks:");
    if (remarks) {
        const response = await fetch(`/submission_remarks/${submissionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remarks })
        });
        
        const result = await response.json();
        if (response.ok) {
            document.getElementById(`remarks_${submissionId}`).textContent = remarks;
        } else {
            alert(result.message);
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add("login-active");
});
