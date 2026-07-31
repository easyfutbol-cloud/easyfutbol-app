import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme';

export default function SegmentedControl({ options, value, onChange, accessibilityLabel }) {
  return (
    <View style={styles.container} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: spacing(2),
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  option: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(1),
    borderRadius: radii.small,
  },
  optionSelected: {
    backgroundColor: colors.orange,
  },
  label: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.black,
    fontWeight: '900',
  },
});
