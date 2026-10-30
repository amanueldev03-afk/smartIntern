import http from 'http';
import app from '../server.js';
import { authenticateUser } from '../src/services/authService.js';

async function httpRequest(serverPort, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: serverPort,
      path,
      method,
      headers
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(data).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
        } catch {
          resolve({ status: res.statusCode, raw: text });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function verifyFallbackRoutes() {
  // Start server on an ephemeral test port
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const testPort = testServer.address().port;
  console.log(`Test server running on port ${testPort}`);

  try {
    console.log('--- Authenticating users for fallback verification ---');
    const student = await authenticateUser('student@smartintern.et', 'StudentPassword123!');
    const admin = await authenticateUser('admin@smartintern.et', 'AdminPassword123!');

    const studentToken = student.access;
    const adminToken = admin.access;

    const checks = [
      {
        name: 'GET /api/applications/history/',
        path: '/api/applications/history/',
        token: studentToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body.results),
      },
      {
        name: 'GET /api/v1/uil-profiles/student/dean-chat/',
        path: '/api/v1/uil-profiles/student/dean-chat/',
        token: studentToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body.messages),
      },
      {
        name: 'GET /api/v1/uil-profiles/student/uil-chat/',
        path: '/api/v1/uil-profiles/student/uil-chat/',
        token: studentToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body.messages),
      },
      {
        name: 'GET /api/companies/student/invitations/',
        path: '/api/companies/student/invitations/',
        token: studentToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body),
      },
      {
        name: 'GET /api/v1/projects/cohorts/my-cohorts/',
        path: '/api/v1/projects/cohorts/my-cohorts/',
        token: studentToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body.cohorts),
      },
      {
        name: 'GET /api/v1/auth/admin/pending-staff/',
        path: '/api/v1/auth/admin/pending-staff/',
        token: adminToken,
        validate: (res) => res.status === 200 && Array.isArray(res.body),
      },
    ];

    let passed = 0;
    for (const c of checks) {
      const res = await httpRequest(testPort, c.path, 'GET', c.token);
      const ok = c.validate(res);
      if (ok) {
        console.log(`✓ [PASS] ${c.name} -> status ${res.status}`);
        passed++;
      } else {
        console.error(`✗ [FAIL] ${c.name} -> status ${res.status}, body:`, res.body || res.raw);
      }
    }

    console.log(`\nResult: ${passed}/${checks.length} tests passed.`);
    testServer.close();
    process.exit(passed === checks.length ? 0 : 1);
  } catch (err) {
    console.error(err);
    testServer.close();
    process.exit(1);
  }
}

verifyFallbackRoutes();
