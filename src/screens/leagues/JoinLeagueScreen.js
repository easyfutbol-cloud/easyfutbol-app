import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';

export default function JoinLeagueScreen() {
  const [inviteCode, setInviteCode] = useState('');

  const handleJoin = () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Introduce un código de invitación.');
      return;
    }

    // Aquí luego irá la llamada al backend
    Alert.alert('Próximamente', `Código introducido: ${inviteCode}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unirme a una liga</Text>
      <Text style={styles.subtitle}>
        Introduce el código que te haya enviado el capitán de tu equipo.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Código de invitación"
        placeholderTextColor="#666"
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="characters"
      />

      <TouchableOpacity style={styles.button} onPress={handleJoin}>
        <Text style={styles.buttonText}>Unirme</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});