-- Descuento del primer EasyPass individual: una fila por usuario. La tabla
-- arranca vacía, así que todo el mundo tiene el descuento una vez aunque ya
-- hubiera comprado antes. 'pending' = checkout abierto con descuento,
-- 'used' = pagado (lo marca el webhook de Stripe).
CREATE TABLE IF NOT EXISTS easypass_first_pack_discounts (
  user_id INT NOT NULL PRIMARY KEY,
  stripe_session_id VARCHAR(255) NOT NULL,
  status ENUM('pending','used') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  CONSTRAINT fk_first_pack_discount_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
