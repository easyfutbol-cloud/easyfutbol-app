-- Visitas al perfil público: una fila por visitante y día, así el contador
-- ("23 personas han visto tu perfil esta semana") cuenta personas, no
-- recargas. El dueño solo ve el número, nunca quién le ha visitado.
CREATE TABLE IF NOT EXISTS profile_views (
  profile_user_id INT NOT NULL,
  viewer_user_id INT NOT NULL,
  viewed_on DATE NOT NULL,
  PRIMARY KEY (profile_user_id, viewer_user_id, viewed_on),
  KEY idx_profile_views_profile_day (profile_user_id, viewed_on),
  CONSTRAINT fk_profile_views_profile FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_views_viewer FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);
