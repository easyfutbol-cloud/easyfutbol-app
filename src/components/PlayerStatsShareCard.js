import React, { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Modal, useWindowDimensions, TouchableOpacity, ActivityIndicator, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { resolveSocialAvatarUrl } from './social/SocialComponents';

const TEMPLATE_IMAGE = require('../../assets/tarjetaresumen.png');
const APP_LOGO = require('../../assets/Logo.png');
const TEMPLATE_WIDTH = 1080;
const TEMPLATE_HEIGHT = 1920;

// Todas las medidas están en píxeles de la plantilla (1080x1920) y se
// escalan al ancho real con `k`, así la tarjeta queda igual en cualquier móvil.
const NAME_BANNER = { centerY: 1218, width: 700, height: 100 };
const AVATAR = { centerY: 797, size: 400 };
const STAT_NUMBER = { centerY: 1368, leftX: 320, rightX: 760, width: 400, height: 130 };
const DATE_BOX = { centerY: 1622, width: 840, height: 120 };
// Sello de MVP: esquina inferior derecha de la foto, ligeramente girado.
const MVP_STAMP = { centerX: 790, centerY: 985, width: 250, height: 116 };

const OUTLINE = '#1a1a1a';

function formatCardDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }).toUpperCase();
}

export function PlayerStatsCard({ name, avatarUrl, goals, assists, isMvp, date, cardRef, cardWidth }) {
  const [width, setWidth] = useState(0);
  const k = width / TEMPLATE_WIDTH;
  const avatarUri = resolveSocialAvatarUrl(avatarUrl);

  const box = (centerX, centerY, w, h) => ({
    position: 'absolute',
    left: (centerX - w / 2) * k,
    top: (centerY - h / 2) * k,
    width: w * k,
    height: h * k,
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={[styles.card, cardWidth ? { width: cardWidth } : null]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Image source={TEMPLATE_IMAGE} style={styles.template} resizeMode="cover" />

      {width > 0 ? (
        <>
          <View
            style={[
              box(TEMPLATE_WIDTH / 2, AVATAR.centerY, AVATAR.size, AVATAR.size),
              styles.avatarRing,
              { borderRadius: (AVATAR.size * k) / 2, borderWidth: 8 * k },
            ]}
          >
            <Image
              source={avatarUri ? { uri: avatarUri } : APP_LOGO}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          </View>

          {isMvp ? (
            <View style={[box(MVP_STAMP.centerX, MVP_STAMP.centerY, MVP_STAMP.width, MVP_STAMP.height), { transform: [{ rotate: '-10deg' }] }]}>
              <View
                style={[
                  styles.stampShadow,
                  { borderRadius: 22 * k, top: 8 * k, left: 8 * k, right: -8 * k, bottom: -8 * k },
                ]}
              />
              <View style={[styles.stamp, { borderRadius: 22 * k, borderWidth: 6 * k, gap: 8 * k }]}>
                <Ionicons name="star" size={56 * k} color="#fdf6e9" />
                <Text style={[styles.stampText, { fontSize: 74 * k }]}>MVP</Text>
              </View>
            </View>
          ) : null}

          <View style={box(TEMPLATE_WIDTH / 2, NAME_BANNER.centerY, NAME_BANNER.width, NAME_BANNER.height)}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.4}
              style={[styles.name, { fontSize: 70 * k, textShadowRadius: 0, textShadowOffset: { width: 3 * k, height: 3 * k } }]}
            >
              {String(name || 'JUGADOR').toUpperCase()}
            </Text>
          </View>

          <View style={box(STAT_NUMBER.leftX, STAT_NUMBER.centerY, STAT_NUMBER.width, STAT_NUMBER.height)}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={[styles.statNumber, { fontSize: 120 * k }]}>
              {Number(goals || 0)}
            </Text>
          </View>
          <View style={box(STAT_NUMBER.rightX, STAT_NUMBER.centerY, STAT_NUMBER.width, STAT_NUMBER.height)}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={[styles.statNumber, { fontSize: 120 * k }]}>
              {Number(assists || 0)}
            </Text>
          </View>

          <View style={box(TEMPLATE_WIDTH / 2, DATE_BOX.centerY, DATE_BOX.width, DATE_BOX.height)}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={[styles.date, { fontSize: 96 * k }]}>
              {formatCardDate(date)}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

// Ventana con la vista previa de la tarjeta y el botón de compartir como imagen.
export default function PlayerStatsShareModal({ visible, onClose, name, avatarUrl, goals, assists, isMvp, date }) {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  // Cabe en pantalla sin deformarse: limitado por el ancho o por el alto libre.
  const cardWidth = Math.floor(Math.min(winWidth - 32, (winHeight - 230) * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT)));

  const handleShare = async () => {
    try {
      setSharing(true);
      if (!(await Sharing.isAvailableAsync())) {
        await Share.share({ message: `⚽ ${name}: ${goals} goles y ${assists} asistencias con EasyFutbol` });
        return;
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: TEMPLATE_WIDTH,
        height: TEMPLATE_HEIGHT,
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir mis estadísticas' });
    } catch (e) {
      Alert.alert('Error', 'No se pudo preparar la tarjeta para compartir');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.previewWrap}>
          <PlayerStatsCard
            cardRef={cardRef}
            cardWidth={cardWidth}
            name={name}
            avatarUrl={avatarUrl}
            goals={goals}
            assists={assists}
            isMvp={isMvp}
            date={date}
          />
        </View>

        <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={sharing}>
          {sharing ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="share-outline" size={19} color="#fff" />
              <Text style={styles.shareButtonText}>Compartir tarjeta</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 56, paddingBottom: 32, paddingHorizontal: 16 },
  closeButton: { alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 20, backgroundColor: '#1c1c1c', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  previewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', aspectRatio: TEMPLATE_WIDTH / TEMPLATE_HEIGHT, backgroundColor: '#000', overflow: 'hidden' },
  template: { position: 'absolute', width: '100%', height: '100%' },
  avatarRing: { borderColor: '#fdf6e9', backgroundColor: '#000', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  name: { color: '#fff', fontWeight: '900', textAlign: 'center', textShadowColor: OUTLINE },
  statNumber: { color: OUTLINE, fontWeight: '900', textAlign: 'center' },
  stampShadow: { position: 'absolute', backgroundColor: OUTLINE },
  stamp: { width: '100%', height: '100%', backgroundColor: '#ff5a00', borderColor: OUTLINE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stampText: { color: '#fdf6e9', fontWeight: '900', letterSpacing: 2 },
  date: { color: OUTLINE, fontWeight: '900', textAlign: 'center' },
  shareButton: { marginTop: 16, height: 54, borderRadius: 14, backgroundColor: '#ff5a00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
