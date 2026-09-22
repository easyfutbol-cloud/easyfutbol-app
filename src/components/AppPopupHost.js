import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Modal, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const PUBLIC_BASE = String(api?.defaults?.baseURL || '').replace(/\/api\/?$/, '');

// Popups ya enseñados en esta sesión de la app: los de frecuencia "en cada
// apertura" no deben reaparecer cada vez que se vuelve a la portada.
const shownThisSession = new Set();

export function resolvePopupImage(imageUrl) {
  if (!imageUrl) return null;
  // También acepta rutas locales (vista previa del admin antes de subir la foto)
  if (/^(https?|file|content):\/\//i.test(imageUrl)) return imageUrl;
  return `${PUBLIC_BASE}${imageUrl}`;
}

// Tarjeta del popup. La usan tanto los jugadores como la vista previa del admin.
export function AppPopupCard({ popup, onPrimary, onClose }) {
  const imageUri = resolvePopupImage(popup?.image_url);
  const hasAction = popup?.action_type && popup.action_type !== 'none';

  return (
    <View style={styles.card}>
      {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" /> : null}
      <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
        <Ionicons name="close" size={18} color="#fff" />
      </TouchableOpacity>

      <View style={styles.body}>
        <Text style={styles.title}>{popup?.title}</Text>
        {popup?.body ? <Text style={styles.text}>{popup.body}</Text> : null}

        {hasAction ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={onPrimary}>
              <Text style={styles.primaryButtonText}>{popup.button_label}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Ahora no</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Entendido</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Se monta en la portada. `enabled` deja que otras ventanas (p. ej. la de
// WhatsApp) pasen primero, para no abrir dos modales a la vez.
export default function AppPopupHost({ navigation, enabled }) {
  const [popup, setPopup] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled || checked) return;
    setChecked(true);
    let cancelled = false;
    api.get('/popups/active')
      .then((res) => {
        const next = res.data?.popup;
        if (cancelled || !next || shownThisSession.has(next.id)) return;
        shownThisSession.add(next.id);
        setPopup(next);
        api.post(`/popups/${next.id}/event`, { action: 'view' }).catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, checked]);

  const close = useCallback(() => setPopup(null), []);

  const handlePrimary = useCallback(() => {
    const current = popup;
    setPopup(null);
    if (!current) return;
    api.post(`/popups/${current.id}/event`, { action: 'click' }).catch(() => {});
    if (current.action_type === 'url' && /^https:\/\//i.test(current.action_value || '')) {
      Linking.openURL(current.action_value).catch(() => {});
    } else if (current.action_type === 'screen' && current.action_value) {
      try { navigation.navigate(current.action_value); } catch { /* pantalla inexistente en esta versión */ }
    }
  }, [popup, navigation]);

  if (!popup) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <AppPopupCard popup={popup} onPrimary={handlePrimary} onClose={close} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#141414', borderRadius: 24, borderWidth: 1, borderColor: '#262626', overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#1a1a1a' },
  closeButton: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 22 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900', paddingRight: 24 },
  text: { color: '#bdbdbd', fontSize: 14, lineHeight: 21, marginTop: 10 },
  primaryButton: { marginTop: 20, minHeight: 48, borderRadius: 14, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: { marginTop: 6, paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#888', fontSize: 13, fontWeight: '700' },
});
