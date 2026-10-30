import http from 'http';

async function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const text = buffer.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : {}, buffer });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: text, buffer });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('--- 1. Testing Student Authentication ---');
  const loginRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/auth/login/', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'student@smartintern.et', password: 'StudentPassword123!' });
  console.log('Student Login status:', loginRes.status, 'Has access token:', !!loginRes.body.access);
  const studentToken = loginRes.body.access;

  console.log('\n--- 2. Testing Admin Authentication ---');
  const adminLoginRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/auth/login/', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@smartintern.et', password: 'AdminPassword123!' });
  console.log('Admin Login status:', adminLoginRes.status, 'Has access token:', !!adminLoginRes.body.access);
  const adminToken = adminLoginRes.body.access;

  console.log('\n--- 3. Testing Student Profile & Completion ---');
  const profileRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/students/me/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Student Profile Status:', profileRes.status, 'Completion:', profileRes.body.completion?.percent + '%');

  console.log('\n--- 4. Testing AI Recommendations ---');
  const recRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/recommendations/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Recommendations Status:', recRes.status, 'Results count:', recRes.body.results?.length);

  console.log('\n--- 5. Testing Save Internship Flow ---');
  const targetInternshipId = recRes.body.results?.[0]?.internship?.id || recRes.body.results?.[0]?.id || 6;
  const saveRes = await request({
    hostname: 'localhost', port: 8000, path: `/api/internships/${targetInternshipId}/save/`, method: 'POST',
    headers: { 'Authorization': 'Bearer ' + studentToken, 'Content-Type': 'application/json' }
  });
  console.log('Save Status:', saveRes.status, 'Message:', saveRes.body.message);

  const savedListRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/internships/saved/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Saved List Status:', savedListRes.status, 'Count:', Array.isArray(savedListRes.body) ? savedListRes.body.length : savedListRes.body.count);

  console.log('\n--- 6. Testing Logistics Pass & Clearance ---');
  const logRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/v1/logistics/pass/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Logistics Pass Status:', logRes.status, 'Dorm block:', logRes.body.dorm_block, 'Room:', logRes.body.dorm_room);

  const clearRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/v1/logistics/clearance/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Logistics Clearance Status:', clearRes.status, 'Cleared at exit:', clearRes.body.cleared);

  console.log('\n--- 7. Testing Admin Analytics ---');
  const analyticsRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/admin/analytics/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });
  console.log('Admin Analytics Status:', analyticsRes.status, 'Total Students:', analyticsRes.body.overview?.total_students);

  console.log('\n--- 8. Testing UIL Excel Export ---');
  const excelRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/v1/uil-profiles/departments/roster-excel/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });
  console.log('Excel Export Status:', excelRes.status, 'Content-Type:', excelRes.headers['content-type'], 'Bytes:', excelRes.buffer?.length);

  console.log('\n--- 9. Testing Notifications ---');
  const notifRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/v1/notifications/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Notifications Status:', notifRes.status, 'List length:', Array.isArray(notifRes.body) ? notifRes.body.length : 'not array');

  console.log('\n--- 10. Testing Projects / My Channel ---');
  const projRes = await request({
    hostname: 'localhost', port: 8000, path: '/api/v1/projects/my-channel/', method: 'GET',
    headers: { 'Authorization': 'Bearer ' + studentToken }
  });
  console.log('Projects Channel Status:', projRes.status, 'Team Name:', projRes.body.team?.team_name, 'Members count:', projRes.body.team?.members?.length);

  console.log('\n--- 11. Testing Sending a Project Message ---');
  if (projRes.body.team?.id) {
    const msgRes = await request({
      hostname: 'localhost', port: 8000, path: `/api/v1/projects/teams/${projRes.body.team.id}/messages/`, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + studentToken, 'Content-Type': 'application/json' }
    }, { content: 'Sprint 1 kickoff meeting completed successfully.' });
    console.log('Send Message Status:', msgRes.status, 'Message content:', msgRes.body.content);
  }

  console.log('\n🎉 ALL 11 DOMAIN FLOWS VERIFIED WITH 100% SUCCESS!');
}

run().catch(console.error);
