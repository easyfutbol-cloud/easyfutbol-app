import React from 'react';
import {
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  colors,
  gradients,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../theme';

export default function SportsFeatureCard({
  title,
  description,
  eyebrow,
  imageSource,
  onPress,
  accent = false,
  compact = false,
  accessibilityHint,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.wrapper, compact && styles.wrapperCompact]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint || `Abre la sección ${title}`}
    >
      <ImageBackground source={imageSource} style={styles.background} imageStyle={styles.image}>
        <LinearGradient
          colors={accent ? ['rgba(132, 42, 0, 0.30)', 'rgba(8, 10, 14, 0.96)'] : gradients.card}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.content, compact && styles.contentCompact]}
        >
          <View style={styles.topRow}>
            {eyebrow ? (
              <View style={[styles.badge, accent && styles.badgeAccent]}>
                <Text style={styles.badgeText}>{eyebrow}</Text>
              </View>
            ) : (
              <View />
            )}
            <View style={styles.arrow} accessible={false}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </View>

          <View>
            <Text style={styles.title}>{title}</Text>
            {description ? (
              <Text style={styles.description} numberOfLines={compact ? 3 : 4}>
                {description}
              </Text>
            ) : null}
          </View>
        </LinearGradient>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 190,
    borderRadius: radii.large,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  wrapperCompact: {
    minHeight: 174,
  },
  background: {
    flex: 1,
  },
  image: {
    resizeMode: 'cover',
  },
  content: {
    flex: 1,
    minHeight: 190,
    padding: spacing(2),
    justifyContent: 'space-between',
  },
  contentCompact: {
    minHeight: 174,
  },
  topRow: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.65),
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  badgeAccent: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  badgeText: {
    color: colors.white,
    ...typography.overline,
  },
  arrow: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  arrowText: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '300',
    marginTop: -2,
  },
  title: {
    color: colors.white,
    ...typography.heading,
  },
  description: {
    color: colors.textMuted,
    ...typography.body,
    marginTop: spacing(0.75),
  },
});
