import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';

test('bcrypt mantiene compatibilidad con hashes existentes', async () => {
  const password = 'EasyFutbol!2026';
  const hash = await bcrypt.hash(password, 10);

  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare('incorrecta', hash), false);
  assert.match(hash, /^\$2[aby]\$10\$/);
});

test('Nodemailer construye el correo sin red ni acceso a archivos', async () => {
  const transporter = nodemailer.createTransport({
    jsonTransport: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const result = await transporter.sendMail({
    from: 'EasyFutbol <no-reply@easyfutbol.es>',
    to: 'jugador@example.com',
    subject: 'Código EasyFutbol',
    text: 'Mensaje de prueba',
  });
  const message = JSON.parse(result.message);

  assert.equal(message.subject, 'Código EasyFutbol');
  assert.equal(message.to[0].address, 'jugador@example.com');
  assert.equal(message.text, 'Mensaje de prueba');
});
