import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { requireAuth } from '../src/middlewares/auth.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('identifica un JWT caducado para que la app avise al usuario', () => {
  const token = jwt.sign(
    { id: 123 },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: -1 }
  );
  const req = {
    headers: { authorization: `Bearer ${token}` },
    query: {},
    originalUrl: '/api/me/credits',
    method: 'GET',
  };
  const res = createResponse();
  let calledNext = false;

  requireAuth(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    ok: false,
    code: 'SESSION_EXPIRED',
    msg: 'La sesión ha caducado',
  });
});
