import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, useWindowDimensions, TouchableOpacity, ActivityIndicator, Share, Alert, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
const INSTAGRAM_GRADIENT = ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'];

// expo-media-library es nativo: los binarios anteriores a esta versión no lo
// tienen y una OTA no puede añadirlo, así que se carga con red de seguridad y
// sin él se cae al menú de compartir del sistema.
let MediaLibrary = null;
try {
  MediaLibrary = require('expo-media-library/legacy');
} catch {
  MediaLibrary = null;
}

// Ventana con la vista previa de una tarjeta 1080x1920 y los botones de
// Instagram, descargar y compartir como imagen. `renderCard(cardRef, width)`
// pinta la tarjeta; `fallbackMessage` se comparte como texto si el móvil no
// puede compartir imágenes. `footer` va debajo de los botones (p. ej. "¿Repites?").
export default function ShareCardModal({ visible, onClose, title, renderCard, fallbackMessage, dialogTitle = 'Compartir', footer = null }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  // Cabe en pantalla sin deformarse: limitado por el ancho o por el alto libre.
  const cardWidth = Math.floor(Math.min(winWidth - 32, (winHeight - (title ? 300 : 270) - (footer ? 86 : 0)) * (CARD_WIDTH / CARD_HEIGHT)));

  const capture = () => captureRef(cardRef, {
    format: 'png',
    quality: 1,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });

  const run = (key, task) => async () => {
    if (busy) return;
    try {
      setBusy(key);
      await task();
    } catch (e) {
      Alert.alert('Error', 'No se pudo preparar la tarjeta. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const shareSheet = async (uri) => {
    if (!(await Sharing.isAvailableAsync())) {
      await Share.share({ message: fallbackMessage });
      return;
    }
    await Sharing.shareAsync(uri || (await capture()), { mimeType: 'image/png', dialogTitle });
  };

  const askLibraryPermission = async (writeOnly) => {
    const { granted } = await MediaLibrary.requestPermissionsAsync(writeOnly);
    if (!granted) {
      Alert.alert('Sin acceso a la galería', 'Activa el permiso de Fotos para EasyFutbol en los ajustes del móvil.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
      ]);
    }
    return granted;
  };

  const handleDownload = run('download', async () => {
    const uri = await capture();
    if (!MediaLibrary) {
      // App sin el módulo nativo: el menú del sistema tiene "Guardar imagen".
      await shareSheet(uri);
      return;
    }
    if (!(await askLibraryPermission(true))) return;
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('¡Guardada!', 'Tienes la tarjeta en tu galería.');
  });

  const handleInstagram = run('instagram', async () => {
    const uri = await capture();
    // iOS: se guarda en Fotos y se abre Instagram con esa imagen ya elegida
    // (permite publicarla en historia o en el feed).
    if (Platform.OS === 'ios' && MediaLibrary && (await Linking.canOpenURL('instagram://app'))) {
      if (!(await askLibraryPermission(false))) return;
      const asset = await MediaLibrary.createAssetAsync(uri);
      await Linking.openURL(`instagram://library?LocalIdentifier=${encodeURIComponent(asset.id)}`);
      return;
    }
    // Android (o sin Instagram instalado): menú de compartir, donde aparece
    // Instagram con sus opciones de historia, feed y mensaje.
    await shareSheet(uri);
  });

  const handleShare = run('share', () => shareSheet());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : <View style={{ flex: 1 }} />}
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.previewWrap}>
          {renderCard(cardRef, cardWidth)}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionFlex} onPress={handleInstagram} disabled={!!busy} accessibilityRole="button">
            <LinearGradient colors={INSTAGRAM_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.actionButton}>
              {busy === 'instagram' ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="logo-instagram" size={20} color="#fff" />
                  <Text style={styles.actionText}>Instagram</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionFlex, styles.actionButton, styles.downloadButton]} onPress={handleDownload} disabled={!!busy} accessibilityRole="button">
            {busy === 'download' ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.actionText}>Descargar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.moreButton} onPress={handleShare} disabled={!!busy} accessibilityRole="button">
          {busy === 'share' ? <ActivityIndicator color="#ff5a00" size="small" /> : (
            <>
              <Ionicons name="share-outline" size={16} color="#ff5a00" />
              <Text style={styles.moreText}>Más opciones para compartir</Text>
            </>
          )}
        </TouchableOpacity>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 56, paddingBottom: 32, paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '900' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1c1c1c', alignItems: 'center', justifyContent: 'center' },
  previewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionFlex: { flex: 1 },
  actionButton: { height: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  downloadButton: { backgroundColor: '#ff5a00' },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  moreButton: { height: 40, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  moreText: { color: '#ff5a00', fontSize: 13, fontWeight: '800' },
  footer: { marginTop: 8 },
});
