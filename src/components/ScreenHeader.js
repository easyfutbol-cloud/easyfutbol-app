import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

export default function ScreenHeader({ eyebrow, title, description, action }) {
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing(2.5),
  },
  copy: {
    flex: 1,
  },
  eyebrow: {
    color: colors.orange,
    ...typography.overline,
    marginBottom: spacing(0.5),
  },
  title: {
    color: colors.white,
    ...typography.display,
  },
  description: {
    color: colors.textMuted,
    ...typography.body,
    maxWidth: 560,
    marginTop: spacing(0.75),
  },
  action: {
    marginLeft: spacing(2),
  },
});
