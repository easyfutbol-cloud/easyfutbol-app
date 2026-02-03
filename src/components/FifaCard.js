// src/components/FifaCard.js
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: DEVICE_W } = Dimensions.get('window');

const FIELD_BG = {
  uri: 'https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2400&auto=format&fit=crop',
};

export default function FifaCard({ avatarUrl, name, role }) {
  // Estos valores son SOLO para la animación del shimmer, no para el layout
  const CARD_W = DEVICE_W * 0.9;
  const CARD_H = CARD_W * 0.7; // proporción más baja → carta visualmente más “ancha”

  const shimmerX = useRef(new Animated.Value(-CARD_W)).current;

  useEffect(() => {
    shimmerX.setValue(-CARD_W);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: CARD_W,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(shimmerX, {
          toValue: -CARD_W,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(700),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [CARD_W, shimmerX]);

  return (
    // 👉 AQUÍ: la carta ocupa el 100 % del ancho del contenedor
    <View style={styles.cardWrapEF}>
      <LinearGradient
        colors={['#ffd7b0', '#ff9e40', '#ff5a00', '#ffd7b0']}
        locations={[0, 0.25, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardBezel}
      >
        {/* SHIMMER del marco (usa CARD_W/CARD_H pero no afecta al layout) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmerStrip,
            {
              top: -CARD_H * 0.15,
              left: -CARD_W,
              width: CARD_W * 0.5,
              height: CARD_H * 1.4,
              transform: [{ translateX: shimmerX }, { rotate: '12deg' }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.65)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0.1, 0.5, 0.9]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.cardCut}>
          <View style={styles.cardGlow} />

          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.cardTopSheen}
          />

          <ImageBackground
            source={FIELD_BG}
            style={styles.cardBgEF}
            imageStyle={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              opacity: 0.9,
            }}
            blurRadius={22}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
              style={StyleSheet.absoluteFill}
            />
          </ImageBackground>

          <View style={styles.avatarRingEF}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.cardAvatarEF} />
            ) : (
              <View style={[styles.cardAvatarEF, styles.cardAvatarEmpty]}>
                <Text style={{ color: '#bbb', fontWeight: '700' }}>
                  Añadir foto
                </Text>
              </View>
            )}
          </View>

          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <Text style={styles.cardNameEF} numberOfLines={1}>
              {name || 'Jugador'}
            </Text>
            {!!role && <Text style={styles.cardRoleEF}>{role}</Text>}
          </View>

          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
            style={styles.cardBottomSheen}
          />

          <View style={styles.tipTL} />
          <View style={styles.tipTR} />
          <View style={styles.tipBL} />
          <View style={styles.tipBR} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  // 👉 aquí se define el ancho visible real de la carta
  cardWrapEF: {
    width: '100%',          // ocupa todo el ancho disponible
    alignSelf: 'stretch',
    aspectRatio: 0.7,       // ancho > alto → se ve “gordita”
    borderRadius: 26,
    padding: 6,
  },
  cardBezel: {
    flex: 1,
    borderRadius: 26,
    padding: 6,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    overflow: 'hidden',
  },
  shimmerStrip: { position: 'absolute', opacity: 0.7 },

  cardCut: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardGlow: {
    position: 'absolute',
    top: -40,
    left: -40,
    right: -40,
    bottom: -40,
    borderRadius: 40,
    backgroundColor: 'rgba(255,90,0,0.08)',
  },
  cardBgEF: { width: '100%', height: '38%' },

  cardTopSheen: {
    position: 'absolute',
    top: 0,
    height: 78,
    width: '100%',
  },
  cardBottomSheen: {
    position: 'absolute',
    bottom: 0,
    height: 58,
    width: '100%',
  },

  avatarRingEF: {
    marginTop: -34,
    alignSelf: 'center',
    borderWidth: 3,
    borderColor: '#ffe3c1',
    borderRadius: 72,
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cardAvatarEF: {
    width: 112,
    height: 112,
    borderRadius: 60,
    backgroundColor: '#222',
  },
  cardAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },

  cardNameEF: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
    maxWidth: '85%',
    textAlign: 'center',
  },
  cardRoleEF: { color: '#ffd7a3', fontSize: 12, marginTop: 2, fontWeight: '700' },

  tipTL: {
    position: 'absolute',
    top: 4,
    left: 10,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#ffe0b8',
    borderTopLeftRadius: 10,
    transform: [{ rotate: '-12deg' }],
    opacity: 0.85,
  },
  tipTR: {
    position: 'absolute',
    top: 4,
    right: 10,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#ffe0b8',
    borderTopRightRadius: 10,
    transform: [{ rotate: '12deg' }],
    opacity: 0.85,
  },
  tipBL: {
    position: 'absolute',
    bottom: 6,
    left: 14,
    width: 14,
    height: 14,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#ffd1a0',
    borderBottomLeftRadius: 10,
    opacity: 0.7,
  },
  tipBR: {
    position: 'absolute',
    bottom: 6,
    right: 14,
    width: 14,
    height: 14,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#ffd1a0',
    borderBottomRightRadius: 10,
    opacity: 0.7,
  },
});