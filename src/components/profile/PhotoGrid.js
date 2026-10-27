import React, { useState } from 'react';
import { FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveSocialAvatarUrl } from '../social/SocialComponents';

const COLLAPSED_COUNT = 9;

// Cuadrícula de 3 columnas con las fotos de partidos; al tocar una se abre a
// pantalla completa y se puede deslizar entre todas.
export default function PhotoGrid({ photos }) {
  const [expanded, setExpanded] = useState(false);
  const [openIndex, setOpenIndex] = useState(null);
  const [current, setCurrent] = useState(0);
  const { width, height } = useWindowDimensions();
  const shown = expanded ? photos : photos.slice(0, COLLAPSED_COUNT);

  const open = (index) => { setCurrent(index); setOpenIndex(index); };
  const photo = photos[current];

  return (
    <>
      <View style={styles.grid}>
        {shown.map((item, index) => (
          <TouchableOpacity key={item.id} style={styles.cell} onPress={() => open(index)} activeOpacity={0.85} accessibilityRole="imagebutton" accessibilityLabel={item.caption || item.match_title || 'Foto de partido'}>
            <Image source={{ uri: resolveSocialAvatarUrl(item.image_url) }} style={styles.cellImage} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
      {photos.length > COLLAPSED_COUNT ? (
        <TouchableOpacity style={styles.more} onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
          <Text style={styles.moreText}>{expanded ? 'Ver menos' : `Ver las ${photos.length} fotos`}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#ff7a32" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={openIndex !== null} transparent animationType="fade" onRequestClose={() => setOpenIndex(null)}>
        <View style={styles.viewer}>
          {openIndex !== null ? (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              initialScrollIndex={openIndex}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => (
                <View style={{ width, height, justifyContent: 'center' }}>
                  <Image source={{ uri: resolveSocialAvatarUrl(item.image_url) }} style={{ width, height: height * 0.75 }} resizeMode="contain" />
                </View>
              )}
            />
          ) : null}
          <TouchableOpacity style={styles.close} onPress={() => setOpenIndex(null)} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.footer} pointerEvents="none">
            {photo?.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
            {photo?.match_title ? <Text style={styles.match}>{photo.match_title}</Text> : null}
            <Text style={styles.counter}>{current + 1} / {photos.length}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -2 },
  cell: { width: '33.333%', aspectRatio: 1, padding: 2 },
  cellImage: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#222' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12 },
  moreText: { color: '#ff7a32', fontWeight: '800', fontSize: 12 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,.96)' },
  close: { position: 'absolute', top: 54, right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 44, alignItems: 'center' },
  caption: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  match: { color: '#a5a8ae', fontSize: 12, marginTop: 4 },
  counter: { color: '#8d9097', fontSize: 12, fontWeight: '800', marginTop: 10 },
});
