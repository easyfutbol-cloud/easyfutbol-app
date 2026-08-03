import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { getActiveTab, PRIMARY_TABS, shouldShowPrimaryNav } from '../navigation/appNavigation';

export default function AppBottomNavigation({ currentRouteName, onNavigate }) {
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(currentRouteName);

  if (!shouldShowPrimaryNav(currentRouteName)) return null;

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.bar}>
        {PRIMARY_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              onPress={() => onNavigate(tab.route)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons name={active ? tab.activeIcon : tab.icon} size={21} color={active ? colors.black : colors.textSubtle} />
              </View>
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'rgba(9,11,15,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 16,
  },
  bar: {
    minHeight: Platform.OS === 'ios' ? 62 : 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  item: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemPressed: { opacity: 0.68 },
  iconWrap: { width: 34, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.orange },
  label: { color: colors.textSubtle, fontSize: 9.5, lineHeight: 12, fontWeight: '700' },
  labelActive: { color: colors.white, fontWeight: '900' },
});
