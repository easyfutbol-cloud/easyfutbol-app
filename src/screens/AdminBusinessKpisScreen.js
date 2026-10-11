import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SegmentedControl from '../components/SegmentedControl';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const LOCATIONS = [
  { value: 'all', label: 'Global', id: null },
  { value: 'valladolid', label: 'Valladolid', id: 1 },
  { value: 'asturias', label: 'Asturias', id: 2 },
];
const TABS = [
  { value: 'traction', label: 'Tracción' },
  { value: 'money', label: 'Ingresos' },
  { value: 'acquisition', label: 'CAC' },
];
const CHANNELS = ['Instagram', 'TikTok', 'Meta Ads', 'Google Ads', 'Radio', 'Flyers', 'Colaboraciones', 'Otro'];

// ---------- formato ----------

const eurFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eurRoundFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const isNone = (value) => value === null || value === undefined || Number.isNaN(Number(value));

export const money = (cents) => (isNone(cents) ? '—' : eurFormatter.format(Number(cents) / 100));
export const moneyRound = (cents) => (isNone(cents) ? '—' : eurRoundFormatter.format(Number(cents) / 100));
export const pct = (value, digits = 0) => (isNone(value)
  ? '—'
  : `${(Number(value) * 100).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`);
export const num = (value, digits = 0) => (isNone(value) ? '—' : Number(value).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }));

export function monthLabel(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return String(key || '');
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
}

const lastCompleteMonth = (rows) => [...(rows || [])].reverse().find((row) => !row.partial);

// ---------- piezas de pantalla ----------

export function KpiCard({ icon, label, value, sub, info }) {
  return (
    <TouchableOpacity
      activeOpacity={info ? 0.8 : 1}
      onPress={info ? () => Alert.alert(label, info) : undefined}
      style={styles.kpiCard}
      accessibilityRole={info ? 'button' : undefined}
      accessibilityLabel={info ? `${label}: ${value}. Toca para ver cómo se calcula.` : `${label}: ${value}`}
    >
      <View style={styles.kpiTop}>
        <View style={styles.kpiIcon}><Ionicons name={icon} size={18} color={colors.orange} /></View>
        {info ? <Ionicons name="information-circle-outline" size={16} color={colors.textSubtle} /> : null}
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export function SectionTitle({ eyebrow, title, hint }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/** Barra horizontal; `segments` permite apilar (p. ej. nuevos + que repiten). */
export function BarRow({ label, segments, max, text, sub, partial }) {
  const total = Math.max(1, Number(max) || 1);
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, partial && styles.barLabelPartial]}>{label}</Text>
      <View style={styles.barBody}>
        <View style={styles.barTrack}>
          {segments.map((segment, index) => (
            <View
              key={index}
              style={{ width: `${Math.min(100, (Math.max(0, Number(segment.value) || 0) / total) * 100)}%`, backgroundColor: segment.color, opacity: partial ? 0.55 : 1 }}
            />
          ))}
        </View>
        {sub ? <Text style={styles.barSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.barValue}>{text}</Text>
    </View>
  );
}

/** Mapa de calor de retención por cohorte (filas: mes del primer partido; columnas: meses después). */
export function CohortHeatmap({ cohorts, averageCurve, columns = 7 }) {
  const rows = (cohorts || []).filter((cohort) => cohort.size > 0);
  const offsets = Array.from({ length: columns }, (_, i) => i);
  const cellColor = (rate) => `rgba(255, 90, 0, ${(0.1 + 0.85 * Math.min(1, Math.max(0, rate))).toFixed(2)})`;

  if (!rows.length) return <Text style={styles.empty}>Todavía no hay jugadores suficientes para medir cohortes.</Text>;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.heatRow}>
          <Text style={[styles.heatHead, styles.heatCohort]}>Primer partido</Text>
          <Text style={[styles.heatHead, styles.heatSize]}>Jug.</Text>
          {offsets.map((offset) => <Text key={offset} style={[styles.heatHead, styles.heatCell]}>{offset === 0 ? 'M0' : `+${offset}`}</Text>)}
        </View>
        {rows.map((cohort) => (
          <View key={cohort.cohort_month} style={styles.heatRow}>
            <Text style={[styles.heatLabel, styles.heatCohort]}>{monthLabel(cohort.cohort_month)}</Text>
            <Text style={[styles.heatLabel, styles.heatSize]}>{cohort.size}</Text>
            {offsets.map((offset) => {
              const rate = cohort.rates?.[offset];
              const partial = cohort.partial_offset === offset;
              return (
                <View key={offset} style={[styles.heatCell, rate === null || rate === undefined ? styles.heatEmpty : { backgroundColor: cellColor(rate) }, partial && styles.heatPartial]}>
                  <Text style={styles.heatValue}>{rate === null || rate === undefined ? '' : Math.round(rate * 100)}</Text>
                </View>
              );
            })}
          </View>
        ))}
        <View style={[styles.heatRow, styles.heatAverageRow]}>
          <Text style={[styles.heatLabel, styles.heatCohort, styles.heatStrong]}>Media</Text>
          <Text style={[styles.heatLabel, styles.heatSize]} />
          {offsets.map((offset) => (
            <Text key={offset} style={[styles.heatValue, styles.heatCell, styles.heatStrong]}>{isNone(averageCurve?.[offset]) ? '' : Math.round(averageCurve[offset] * 100)}</Text>
          ))}
        </View>
        <Text style={styles.heatNote}>% de cada cohorte que vuelve a jugar. El borde discontinuo es el mes en curso (aún incompleto) y no entra en la media.</Text>
      </View>
    </ScrollView>
  );
}

const ORANGE_DARK = '#B5420A';
const ORANGE_LIGHT = colors.orange;
const BLUE = '#6F8BFF';

// ---------- pestaña: tracción ----------

export function TractionTab({ data }) {
  const monthly = data?.monthly || [];
  const current = data?.current || {};
  const retention = data?.retention || {};
  const windows = retention.windows || {};
  const frequency = data?.frequency || {};
  const activation = data?.activation || {};
  const occupancy = data?.occupancy || {};
  const lastFull = lastCompleteMonth(monthly);
  const maxActive = Math.max(1, ...monthly.map((m) => m.active_players || 0));
  const dist = frequency.last_full_month_distribution || {};
  const distTotal = Math.max(1, (dist.one || 0) + (dist.two || 0) + (dist.three_four || 0) + (dist.five_plus || 0));
  const gaps = frequency.days_between_matches_last_180d || {};

  return (
    <>
      <SectionTitle eyebrow="JUGADORES ACTIVOS" title="Indicadores clave" />
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="people-outline" label="Jugadores activos (MAU)" value={num(current.mau_last_30d)}
          sub={`${num(current.mau_month_to_date)} en lo que va de mes`}
          info="Jugadores distintos que han jugado al menos un partido en los últimos 30 días. Jugar = inscripción confirmada en un partido ya disputado y no cancelado. Si una entrada se asignó a otra persona, cuenta para esa persona. No incluye cuentas de administrador."
        />
        <KpiCard
          icon="calendar-outline" label="Activos en 7 días (WAU)" value={num(current.wau_last_7d)}
          sub={`WAU/MAU ${pct(current.stickiness_wau_mau)}`}
          info="Jugadores distintos que han jugado en los últimos 7 días. WAU/MAU mide cuánta parte de los jugadores del mes juega cada semana."
        />
        <KpiCard
          icon="repeat-outline" label="Retención mes a mes" value={pct(lastFull?.mom_retention)}
          sub={lastFull ? `${monthLabel(lastFull.month)} · ${num(lastFull.retained_from_previous)} de ${num(lastFull.previous_active)}` : 'Sin datos aún'}
          info="De los jugadores activos un mes, porcentaje que vuelve a jugar el mes siguiente. Se muestra el último mes completo."
        />
        <KpiCard
          icon="pulse-outline" label="Partidos por jugador" value={num(frequency.avg_matches_per_active_player_last_3_full_months, 2)}
          sub={`Mediana ${num(gaps.median, 0)} días entre partidos`}
          info="Media de partidos por jugador activo y mes, en los últimos 3 meses completos. Debajo, la mediana de días entre dos partidos seguidos del mismo jugador (últimos 180 días)."
        />
        <KpiCard
          icon="trending-up-outline" label="Repiten alguna vez" value={pct(retention.second_match?.rate_lifetime)}
          sub={`2.º partido a los ${num(retention.second_match?.median_days_to_second)} días (mediana)`}
          info="Porcentaje de jugadores que han jugado dos o más partidos, y mediana de días entre el primero y el segundo."
        />
        <KpiCard
          icon="football-outline" label="Ocupación (90 días)" value={pct(occupancy.last_90d?.fill_rate)}
          sub={`${num(occupancy.last_90d?.avg_players_per_match, 1)} jugadores por partido`}
          info="Plazas ocupadas entre plazas ofrecidas en los partidos de los últimos 90 días (solo partidos con al menos un jugador). Cuenta entradas confirmadas, incluidas las de cuentas de administrador, porque la plaza se ocupa igual."
        />
        <KpiCard
          icon="flash-outline" label="Activación (30 días)" value={pct(activation.overall?.rate_30d)}
          sub={`${pct(activation.overall?.rate_7d)} en 7 días`}
          info="De las cuentas creadas, porcentaje que juega su primer partido en los 7 o 30 días siguientes al registro. Solo cuentan las cuentas que ya han cumplido ese plazo; las demás no se cuentan como no activadas."
        />
        <KpiCard
          icon="person-add-outline" label="Jugadores nuevos (30 d)" value={num(current.new_players_last_30d)}
          sub={`${num(current.players_ever)} jugadores en total`}
          info="Jugadores cuyo primer partido fue en los últimos 30 días."
        />
      </View>

      <SectionTitle eyebrow="EVOLUCIÓN" title="Jugadores activos por mes" hint="Naranja oscuro: ya habían jugado antes · naranja: nuevos" />
      {monthly.map((m) => (
        <BarRow
          key={m.month}
          label={monthLabel(m.month)}
          partial={m.partial}
          max={maxActive}
          segments={[{ value: m.returning_players, color: ORANGE_DARK }, { value: m.new_players, color: ORANGE_LIGHT }]}
          text={num(m.active_players)}
          sub={`${num(m.avg_frequency, 2)} partidos/jugador${m.mom_retention === null || m.mom_retention === undefined ? '' : ` · retención ${pct(m.mom_retention)}`}${m.partial ? ' · mes en curso' : ''}`}
        />
      ))}

      <SectionTitle eyebrow="RETENCIÓN" title="Por cohorte de entrada" />
      <View style={styles.card}><CohortHeatmap cohorts={retention.cohorts} averageCurve={retention.average_curve} /></View>

      <SectionTitle eyebrow="RETENCIÓN" title="Vuelven a jugar tras su primer partido" hint="Solo cuentan jugadores que ya han cumplido el plazo." />
      <View style={styles.kpiGrid}>
        {['d30', 'd60', 'd90'].map((key) => (
          <KpiCard
            key={key}
            icon="time-outline"
            label={`En ${windows[key]?.days || key.slice(1)} días`}
            value={pct(windows[key]?.rate)}
            sub={windows[key]?.eligible_players ? `${num(windows[key].returned_players)} de ${num(windows[key].eligible_players)}` : 'Aún sin plazo cumplido'}
            info={`Porcentaje de jugadores que juegan un segundo partido en los ${windows[key]?.days || key.slice(1)} días siguientes a su primero. Un jugador cuyo primer partido fue hace menos de ${windows[key]?.days || key.slice(1)} días no se cuenta todavía.`}
          />
        ))}
      </View>

      <SectionTitle eyebrow="HÁBITO" title="Partidos jugados el último mes completo" hint={frequency.last_full_month ? monthLabel(frequency.last_full_month) : undefined} />
      {[
        ['1 partido', dist.one], ['2 partidos', dist.two], ['3-4 partidos', dist.three_four], ['5 o más', dist.five_plus],
      ].map(([label, value]) => (
        <BarRow key={label} label={label} max={distTotal} segments={[{ value, color: ORANGE_LIGHT }]} text={num(value)} sub={pct((value || 0) / distTotal)} />
      ))}

      <SectionTitle eyebrow="ACTIVACIÓN" title="De registro a primer partido" />
      {(activation.monthly || []).filter((m) => m.registrations > 0).map((m) => (
        <BarRow
          key={m.month}
          label={monthLabel(m.month)}
          max={1}
          segments={[{ value: m.rate_30d || 0, color: ORANGE_LIGHT }]}
          text={pct(m.rate_30d)}
          sub={`${num(m.registrations)} registros · ${m.eligible_30d ? `${num(m.played_within_30d)} jugaron en 30 días` : 'plazo de 30 días sin cumplir'}`}
        />
      ))}
    </>
  );
}

// ---------- pestaña: ingresos ----------

export function MoneyTab({ data, onSync, syncing }) {
  const monthly = data?.monthly || [];
  const price = data?.effective_price || {};
  const all = price.all_time || {};
  const recent = price.last_90d || {};
  const quality = data?.data_quality || {};
  const issuance = data?.issuance?.last_12m || {};
  const liability = data?.liability || {};
  const repurchase = data?.repurchase || {};
  const subscribers = data?.subscribers || {};
  const lastFull = lastCompleteMonth(monthly);
  const current = monthly[monthly.length - 1];
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue_cents || 0));
  const pending = Number(data?.pending_sync || 0);
  const incomplete = pending > 0 || (quality.coverage_rate !== null && quality.coverage_rate !== undefined && quality.coverage_rate < 1);

  return (
    <>
      {incomplete ? (
        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Importes reales de Stripe incompletos</Text>
            <Text style={styles.noticeText}>
              {num(quality.purchases_in_ledger)} de {num(quality.purchases_with_stripe_ref)} compras tienen su importe real{pending > 0 ? ` · ${num(pending)} por leer` : ''}.
              Hasta sincronizarlas, el precio efectivo y los ingresos se quedan cortos.
            </Text>
            {data?.stripe_configured === false ? (
              <Text style={styles.noticeText}>Stripe no está configurado en el servidor.</Text>
            ) : (
              <TouchableOpacity style={styles.noticeButton} onPress={onSync} disabled={syncing}>
                {syncing ? <ActivityIndicator color={colors.black} /> : <Text style={styles.noticeButtonText}>Sincronizar con Stripe</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}

      <SectionTitle eyebrow="PRECIO" title="Precio efectivo por EasyPass" />
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="ticket-outline" label="Precio efectivo medio" value={money(all.paid_per_pass_cents)}
          sub={`Últimos 90 días: ${money(recent.paid_per_pass_cents)}`}
          info="Dinero realmente cobrado entre EasyPass vendidos, tras descuentos de Plus y códigos promocionales. Es lo que el jugador paga de media por cada EasyPass comprado. Solo packs; no incluye los EasyPass regalados ni los de suscripciones."
        />
        <KpiCard
          icon="pricetag-outline" label="Precio de lista medio" value={money(all.list_per_pass_cents)}
          sub={`Descuento medio ${pct(all.discount_rate, 1)}`}
          info="Precio medio por EasyPass antes de descuentos. La diferencia con el precio efectivo es lo que se regala en descuentos (Plus y códigos)."
        />
        <KpiCard
          icon="receipt-outline" label="Ticket medio" value={money(all.avg_order_cents)}
          sub={`${num(all.orders)} compras · ${num(all.passes_sold)} EasyPass`}
          info="Importe medio cobrado por compra de pack."
        />
        <KpiCard
          icon="swap-vertical-outline" label="Precio con EasyPass gratis" value={money(issuance.blended_total_cents)}
          sub={`${pct(issuance.free_share)} de los emitidos son gratis`}
          info="Ingresos totales (packs y suscripciones) entre todos los EasyPass emitidos en 12 meses, incluidos los que se regalan (Plus, referidos, ajustes). Es el precio que realmente se obtiene por cada EasyPass puesto en circulación."
        />
      </View>

      <SectionTitle eyebrow="INGRESOS" title="Resumen" />
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="cash-outline" label="Ingresos mes en curso" value={moneyRound(current?.revenue_cents)}
          sub={lastFull ? `${monthLabel(lastFull.month)}: ${moneyRound(lastFull.revenue_cents)}` : undefined}
          info="Dinero cobrado por Stripe (packs y suscripciones) este mes, tal y como lo paga el jugador. Si el precio incluye IVA, aquí también. El mes en curso está incompleto."
        />
        <KpiCard
          icon="person-outline" label="Ingreso por comprador" value={money(lastFull?.arppu_cents)}
          sub={lastFull ? `${monthLabel(lastFull.month)} · ${num(lastFull.paying_users)} compradores` : undefined}
          info="Ingresos del último mes completo entre el número de usuarios que pagaron ese mes."
        />
        <KpiCard
          icon="repeat-outline" label="Recompra" value={pct(repurchase.repeat_rate)}
          sub={`${num(repurchase.repeat_payers)} de ${num(repurchase.payers)} compradores`}
          info="Porcentaje de compradores que han comprado más de una vez. Se calcula con el libro de EasyPass, que está completo aunque Stripe no esté sincronizado."
        />
        <KpiCard
          icon="star-outline" label="Suscriptores activos" value={num(subscribers.active)}
          sub={subscribers.scope === 'global' ? `MRR a precio de lista ${moneyRound(subscribers.mrr_list_cents)}` : 'No disponible por sede'}
          info="Suscripciones Plus/Pro activas o en prueba. El MRR se calcula con el precio de lista del plan."
        />
        <KpiCard
          icon="wallet-outline" label="EasyPass sin usar" value={num(liability.outstanding_passes)}
          sub={`Valor estimado ${moneyRound(liability.estimated_value_cents)}`}
          info="EasyPass vendidos que los jugadores aún tienen en su saldo. Se valoran al precio efectivo medio de los últimos 90 días de cada sede, así que es una estimación. Representa ingreso ya cobrado pero aún no consumido."
        />
        <KpiCard
          icon="football-outline" label="EasyPass canjeados (12 m)" value={num(issuance.redeemed_net)}
          sub={`${num(issuance.issued_paid)} de pago · ${num(issuance.issued_free)} gratis emitidos`}
          info="EasyPass gastados en partidos menos los devueltos por cancelaciones, en los últimos 12 meses. Debajo, los emitidos por compra y los regalados."
        />
      </View>

      {Object.keys(price.by_location || {}).length ? (
        <>
          <SectionTitle eyebrow="POR SEDE" title="Precio efectivo por EasyPass" />
          {Object.entries(price.by_location).map(([id, stats]) => (
            <View key={id} style={styles.card}>
              <Text style={styles.cardTitle}>{id === '1' ? 'Valladolid' : id === '2' ? 'Asturias' : `Sede ${id}`}</Text>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Efectivo (siempre)</Text><Text style={styles.cardVal}>{money(stats.all_time?.paid_per_pass_cents)}</Text></View>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Efectivo (90 días)</Text><Text style={styles.cardVal}>{money(stats.last_90d?.paid_per_pass_cents)}</Text></View>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Lista medio</Text><Text style={styles.cardVal}>{money(stats.all_time?.list_per_pass_cents)}</Text></View>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Compras · EasyPass</Text><Text style={styles.cardVal}>{num(stats.all_time?.orders)} · {num(stats.all_time?.passes_sold)}</Text></View>
            </View>
          ))}
        </>
      ) : null}

      {(price.by_pack || []).length ? (
        <>
          <SectionTitle eyebrow="POR PACK" title="Qué se vende y a qué precio" />
          {price.by_pack.map((pack) => (
            <View key={pack.pack_id} style={styles.card}>
              <Text style={styles.cardTitle}>{pack.name}</Text>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Compras · ingresos</Text><Text style={styles.cardVal}>{num(pack.orders)} · {moneyRound(pack.revenue_cents)}</Text></View>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Efectivo por EasyPass</Text><Text style={styles.cardVal}>{money(pack.paid_per_pass_cents)}</Text></View>
              <View style={styles.cardRow}><Text style={styles.cardKey}>Lista actual por EasyPass</Text><Text style={styles.cardVal}>{pack.credits ? money(pack.current_list_price_cents / pack.credits) : '—'}</Text></View>
            </View>
          ))}
        </>
      ) : null}

      <SectionTitle eyebrow="EVOLUCIÓN" title="Ingresos por mes" hint="Naranja: packs · azul: suscripciones" />
      {monthly.map((m) => (
        <BarRow
          key={m.month}
          label={monthLabel(m.month)}
          partial={m.partial}
          max={maxRevenue}
          segments={[{ value: m.pack_revenue_cents, color: ORANGE_LIGHT }, { value: m.subscription_revenue_cents, color: BLUE }]}
          text={moneyRound(m.revenue_cents)}
          sub={`${num(m.passes_sold)} EasyPass · ${isNone(m.paid_per_pass_cents) ? 'sin precio' : `${money(m.paid_per_pass_cents)}/EasyPass`}${m.partial ? ' · mes en curso' : ''}`}
        />
      ))}

      <SectionTitle eyebrow="CALIDAD DEL DATO" title="Qué hay detrás de estas cifras" />
      <View style={styles.card}>
        <View style={styles.cardRow}><Text style={styles.cardKey}>Compras con importe real</Text><Text style={styles.cardVal}>{num(quality.purchases_in_ledger)} / {num(quality.purchases_with_stripe_ref)}</Text></View>
        {quality.purchases_without_stripe_ref > 0 ? (
          <View style={styles.cardRow}><Text style={styles.cardKey}>Sin referencia de Stripe (no se pueden leer)</Text><Text style={styles.cardVal}>{num(quality.purchases_without_stripe_ref)}</Text></View>
        ) : null}
        <View style={styles.cardRow}><Text style={styles.cardKey}>Stripe ya no las encuentra</Text><Text style={styles.cardVal}>{num(quality.purchases_unavailable_in_stripe)}</Text></View>
        <View style={styles.cardRow}><Text style={styles.cardKey}>En modo prueba (excluidas)</Text><Text style={styles.cardVal}>{num(quality.purchases_test_mode)}</Text></View>
        <View style={styles.cardRow}><Text style={styles.cardKey}>Compras manuales de prueba</Text><Text style={styles.cardVal}>{num(quality.manual_test_purchases_excluded)}</Text></View>
        <View style={styles.cardRow}><Text style={styles.cardKey}>Estimado con precios de lista de hoy</Text><Text style={styles.cardVal}>{money(quality.estimated_from_current_list_prices?.per_pass_cents)}</Text></View>
        <Text style={styles.footnote}>
          Los importes son lo cobrado al jugador por Stripe, con sus descuentos. Los reembolsos hechos en Stripe se restan del neto.
          La sincronización se ejecuta sola cada 6 horas.
        </Text>
      </View>
    </>
  );
}

// ---------- pestaña: CAC ----------

export function AcquisitionTab({ data, spend, onAdd, onDelete, locationLabel = 'Global' }) {
  const monthly = data?.monthly || [];
  const totals = data?.totals || {};
  const recent = totals.last_3_full_months || {};
  const year = totals.last_12_months || {};
  const payback = data?.payback || {};
  const channels = data?.spend_by_channel_last_12m || [];
  const maxSpend = Math.max(1, ...monthly.map((m) => m.spend_cents || 0));
  const hasSpend = Boolean(data?.has_spend_data);
  const withSpend = monthly.filter((m) => m.spend_cents > 0 || m.registrations > 0 || m.new_payers > 0);

  return (
    <>
      {!hasSpend ? (
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={22} color={colors.orange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Falta registrar el gasto de marketing</Text>
            <Text style={styles.noticeText}>El CAC es el gasto entre los clientes que consigue. La base de datos no sabe cuánto gastas, así que hay que apuntarlo aquí mes a mes. Sin ese dato no se calcula nada: preferimos dejarlo vacío antes que inventarlo.</Text>
          </View>
        </View>
      ) : null}

      <SectionTitle eyebrow="ADQUISICIÓN" title="Coste de captación (CAC)" hint={`${locationLabel} · solo meses completos con gasto registrado`} />
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="wallet-outline" label="CAC por comprador nuevo" value={money(recent.cac_per_new_payer_cents)}
          sub={`12 meses: ${money(year.cac_per_new_payer_cents)}`}
          info="Gasto en marketing entre compradores nuevos (primera compra de pack o primera suscripción). Arriba, los últimos 3 meses completos con gasto; debajo, los 12 meses. Solo se usan los meses en los que hay gasto apuntado."
        />
        <KpiCard
          icon="person-add-outline" label="CAC por jugador nuevo" value={money(recent.cac_per_new_player_cents)}
          sub={`12 meses: ${money(year.cac_per_new_player_cents)}`}
          info="Gasto entre jugadores que juegan su primer partido en el periodo."
        />
        <KpiCard
          icon="create-outline" label="CAC por registro" value={money(recent.cac_per_registration_cents)}
          sub={`12 meses: ${money(year.cac_per_registration_cents)}`}
          info="Gasto entre cuentas creadas en el periodo (sin administradores)."
        />
        <KpiCard
          icon="trending-up-outline" label="Ingreso a 90 días / CAC" value={isNone(payback.revenue_to_cac_ratio) ? '—' : `${num(payback.revenue_to_cac_ratio, 1)}x`}
          sub={payback.payers_observed_90d ? `${money(payback.revenue_per_payer_90d_cents)} por comprador en 90 días` : 'Aún sin compradores con 90 días'}
          info="Ingreso neto que genera de media un comprador en sus primeros 90 días, dividido entre lo que costó conseguirlo. Por encima de 1 significa que se recupera la inversión en 3 meses. Solo cuenta compradores que ya han cumplido 90 días."
        />
      </View>

      {(data?.unallocated_spend_cents || 0) > 0 ? (
        <Text style={styles.footnote}>Hay {money(data.unallocated_spend_cents)} de gasto general sin asignar a esta sede; no se incluye en su CAC.</Text>
      ) : null}

      <SectionTitle eyebrow="EVOLUCIÓN" title="Gasto y clientes por mes" />
      {withSpend.length ? withSpend.map((m) => (
        <BarRow
          key={m.month}
          label={monthLabel(m.month)}
          partial={m.partial}
          max={maxSpend}
          segments={[{ value: m.spend_cents, color: ORANGE_LIGHT }]}
          text={m.spend_cents ? moneyRound(m.spend_cents) : 'sin gasto'}
          sub={`${num(m.registrations)} registros (${num(m.referred_registrations)} por referido) · ${num(m.new_players)} jugadores · ${num(m.new_payers)} compradores${isNone(m.cac_per_new_payer_cents) ? '' : ` · CAC ${money(m.cac_per_new_payer_cents)}`}`}
        />
      )) : <Text style={styles.empty}>Todavía no hay datos de captación.</Text>}

      {channels.length ? (
        <>
          <SectionTitle eyebrow="CANALES" title="Gasto por canal (12 meses)" />
          {channels.map((channel) => (
            <View key={channel.channel} style={styles.cardRowPlain}><Text style={styles.cardKey}>{channel.channel}</Text><Text style={styles.cardVal}>{moneyRound(channel.spend_cents)}</Text></View>
          ))}
          <Text style={styles.footnote}>El CAC por canal no se puede calcular todavía: la app no registra de qué canal viene cada usuario. Solo se distingue a los que llegan por referido.</Text>
        </>
      ) : null}

      <View style={styles.sectionHeadingRow}>
        <SectionTitle eyebrow="DATOS" title="Gasto registrado" />
        <TouchableOpacity style={styles.addButton} onPress={onAdd}>
          <Ionicons name="add" size={18} color={colors.black} />
          <Text style={styles.addButtonText}>Añadir</Text>
        </TouchableOpacity>
      </View>
      {(spend || []).length ? spend.map((entry) => (
        <View key={entry.id} style={styles.spendRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.spendTitle}>{monthLabel(String(entry.month).slice(0, 7))} · {entry.channel}</Text>
            <Text style={styles.spendSub}>{entry.location_id === 1 ? 'Valladolid' : entry.location_id === 2 ? 'Asturias' : 'Todas las sedes'}{entry.notes ? ` · ${entry.notes}` : ''}</Text>
          </View>
          <Text style={styles.spendAmount}>{money(entry.amount_cents)}</Text>
          <TouchableOpacity onPress={() => onDelete(entry)} style={styles.spendDelete} accessibilityLabel="Borrar gasto">
            <Ionicons name="trash-outline" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>
      )) : <Text style={styles.empty}>Aún no has apuntado ningún gasto.</Text>}
    </>
  );
}

// ---------- ventana para apuntar gasto ----------

export function SpendModal({ visible, months, onClose, onSave, saving }) {
  const [month, setMonth] = useState(months[0] || '');
  const [channel, setChannel] = useState('Instagram');
  const [locationId, setLocationId] = useState(0);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setMonth(months[0] || '');
      setAmount('');
      setNotes('');
    }
  }, [visible, months]);

  const submit = () => {
    if (!month) return Alert.alert('Falta el mes', 'Elige a qué mes corresponde el gasto.');
    if (!String(amount).trim()) return Alert.alert('Falta el importe', 'Escribe cuánto has gastado, en euros.');
    onSave({ month, channel: channel.trim() || 'general', location_id: locationId, amount_eur: amount, notes });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Apuntar gasto de marketing</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>Mes</Text>
            <View style={styles.chipRow}>
              {months.map((key) => (
                <TouchableOpacity key={key} style={[styles.chip, month === key && styles.chipActive]} onPress={() => setMonth(key)}>
                  <Text style={[styles.chipText, month === key && styles.chipTextActive]}>{monthLabel(key)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Canal</Text>
            <View style={styles.chipRow}>
              {CHANNELS.map((name) => (
                <TouchableOpacity key={name} style={[styles.chip, channel === name && styles.chipActive]} onPress={() => setChannel(name)}>
                  <Text style={[styles.chipText, channel === name && styles.chipTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Sede</Text>
            <View style={styles.chipRow}>
              {[{ id: 0, label: 'Todas' }, { id: 1, label: 'Valladolid' }, { id: 2, label: 'Asturias' }].map((option) => (
                <TouchableOpacity key={option.id} style={[styles.chip, locationId === option.id && styles.chipActive]} onPress={() => setLocationId(option.id)}>
                  <Text style={[styles.chipText, locationId === option.id && styles.chipTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalHint}>Si lo marcas para una sede, cuenta para el CAC de esa sede. «Todas» solo entra en el CAC global.</Text>

            <Text style={styles.modalLabel}>Importe (€)</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Ej: 350,00" placeholderTextColor={colors.textSubtle} />

            <Text style={styles.modalLabel}>Nota (opcional)</Text>
            <TextInput style={styles.input} value={notes} onChangeText={setNotes} maxLength={255} placeholder="Ej: campaña de septiembre" placeholderTextColor={colors.textSubtle} />
          </ScrollView>

          <TouchableOpacity style={styles.saveButton} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveButtonText}>Guardar gasto</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- pantalla ----------

export default function AdminBusinessKpisScreen({ navigation }) {
  const [locationKey, setLocationKey] = useState('all');
  const [tab, setTab] = useState('traction');
  const [store, setStore] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [spendModal, setSpendModal] = useState(false);
  const [savingSpend, setSavingSpend] = useState(false);
  const [sharing, setSharing] = useState(false);

  const location = useMemo(() => LOCATIONS.find((item) => item.value === locationKey) || LOCATIONS[0], [locationKey]);
  const params = useMemo(() => (location.id ? { location_id: location.id } : {}), [location.id]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const query = refresh ? { ...params, fresh: 1 } : params;
      if (tab === 'traction') {
        const response = await api.get('/kpis/traction', { params: query });
        setStore((current) => ({ ...current, traction: response.data }));
      } else if (tab === 'money') {
        const response = await api.get('/kpis/monetization', { params: query });
        setStore((current) => ({ ...current, money: response.data }));
      } else {
        const [acquisition, spend] = await Promise.all([api.get('/kpis/acquisition', { params: query }), api.get('/kpis/marketing-spend')]);
        setStore((current) => ({ ...current, acquisition: acquisition.data, spend: spend.data?.data || [] }));
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.msg || requestError?.response?.data?.error || 'No se pudieron cargar los indicadores.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, params]);

  useEffect(() => { load(); }, [load]);

  const changeLocation = (value) => {
    setStore({});
    setLocationKey(value);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      // Cada compra es una consulta a Stripe: la petición puede tardar más que el límite normal de la app.
      const response = await api.post('/kpis/revenue/sync', { limit: 100 }, { timeout: 180000 });
      const result = response.data || {};
      Alert.alert(
        'Sincronización terminada',
        `Compras leídas: ${result.packs?.checked ?? 0}. Con importe real: ${result.packs?.inserted ?? 0}.${result.packs?.failed ? ` Con error: ${result.packs.failed}.` : ''}\n${result.remaining > 0 ? `Quedan ${result.remaining} por leer: vuelve a pulsar.` : 'No queda nada pendiente.'}`
      );
      await load(true);
    } catch (requestError) {
      Alert.alert('No se pudo sincronizar', requestError?.response?.data?.msg || requestError?.message || 'Inténtalo de nuevo en unos minutos.');
    } finally {
      setSyncing(false);
    }
  };

  const saveSpend = async (entry) => {
    setSavingSpend(true);
    try {
      const response = await api.put('/kpis/marketing-spend', entry);
      setStore((current) => ({ ...current, spend: response.data?.data || [] }));
      setSpendModal(false);
      await load(true);
    } catch (requestError) {
      Alert.alert('No se pudo guardar', requestError?.response?.data?.msg || requestError?.message || 'Revisa los datos.');
    } finally {
      setSavingSpend(false);
    }
  };

  const deleteSpend = (entry) => {
    Alert.alert('Borrar gasto', `¿Borrar ${entry.channel} de ${monthLabel(String(entry.month).slice(0, 7))}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await api.delete(`/kpis/marketing-spend/${entry.id}`);
            setStore((current) => ({ ...current, spend: response.data?.data || [] }));
            await load(true);
          } catch (requestError) {
            Alert.alert('No se pudo borrar', requestError?.response?.data?.msg || requestError?.message || 'Inténtalo de nuevo.');
          }
        },
      },
    ]);
  };

  const shareReport = async () => {
    setSharing(true);
    try {
      const response = await api.get('/kpis/investor-report', { params: { ...params, format: 'csv' }, responseType: 'text', transformResponse: (body) => body });
      await Share.share({ title: 'KPIs EasyFutbol', message: String(response.data) });
    } catch (requestError) {
      Alert.alert('No se pudo preparar el informe', requestError?.response?.data?.msg || requestError?.message || 'Inténtalo de nuevo.');
    } finally {
      setSharing(false);
    }
  };

  const dataKey = tab === 'money' ? 'money' : tab;
  const data = store[dataKey];
  const spendMonths = useMemo(() => (store.acquisition?.monthly || []).map((m) => m.month).slice(-6).reverse(), [store.acquisition]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.orange} />}
      >
        <LinearGradient colors={['#261307', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation, 'AdminDashboard')}>
            <Ionicons name="arrow-back" size={20} color={colors.white} /><Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroTopline}>
            <View style={styles.heroIcon}><Ionicons name="trending-up" size={26} color={colors.orange} /></View>
            <TouchableOpacity style={styles.shareButton} onPress={shareReport} disabled={sharing}>
              {sharing ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="share-outline" size={16} color={colors.white} />}
              <Text style={styles.shareText}>Informe CSV</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.eyebrow}>ADMINISTRACIÓN · NEGOCIO</Text>
          <Text style={styles.title}>KPIs de negocio</Text>
          <Text style={styles.description}>Retención, jugadores activos, frecuencia, precio por EasyPass y coste de captación. Toca la «i» de cada cifra para ver cómo se calcula.</Text>
        </LinearGradient>

        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>SEDE</Text>
          <SegmentedControl options={LOCATIONS} value={locationKey} onChange={changeLocation} accessibilityLabel="Sede de los indicadores" />
          <Text style={styles.filterLabel}>APARTADO</Text>
          <SegmentedControl options={TABS} value={tab} onChange={setTab} accessibilityLabel="Apartado de indicadores" />
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity>
          </View>
        ) : null}

        {!data && loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={colors.orange} /><Text style={styles.loadingText}>Calculando indicadores…</Text></View>
        ) : null}

        {data && tab === 'traction' ? <TractionTab data={data} /> : null}
        {data && tab === 'money' ? <MoneyTab data={data} onSync={runSync} syncing={syncing} /> : null}
        {data && tab === 'acquisition' ? (
          <AcquisitionTab data={data} spend={store.spend} onAdd={() => setSpendModal(true)} onDelete={deleteSpend} locationLabel={location.label} />
        ) : null}

        <Text style={styles.disclaimer}>
          Cuentas de administrador excluidas. Fechas en hora de Madrid. El mes en curso está incompleto y no entra en las medias.
        </Text>
      </ScrollView>

      <SpendModal visible={spendModal} months={spendMonths.length ? spendMonths : []} onClose={() => setSpendModal(false)} onSave={saveSpend} saving={savingSpend} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(8) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  shareButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.8) },
  shareText: { color: colors.white, ...typography.caption },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  filterCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, padding: spacing(1.5), marginBottom: spacing(2) },
  filterLabel: { color: colors.textSubtle, ...typography.overline, marginBottom: spacing(0.75) },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: 'rgba(255,92,92,0.10)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.3)', borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(2) },
  errorText: { flex: 1, color: colors.danger, ...typography.caption },
  retry: { color: colors.white, ...typography.caption },
  loadingBox: { alignItems: 'center', paddingVertical: spacing(6) },
  loadingText: { color: colors.textMuted, ...typography.body, marginTop: spacing(1.5) },
  sectionHeading: { marginTop: spacing(1.5), marginBottom: spacing(1.25) },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionEyebrow: { color: colors.orange, ...typography.overline },
  sectionTitle: { color: colors.white, ...typography.heading, marginTop: 3 },
  sectionHint: { color: colors.textSubtle, ...typography.caption, marginTop: 3 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(2) },
  kpiCard: { width: '48%', flexGrow: 1, minHeight: 138, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, padding: spacing(1.5) },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,90,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: colors.white, fontSize: 25, lineHeight: 30, fontWeight: '900', marginTop: spacing(1) },
  kpiLabel: { color: colors.textMuted, ...typography.caption, marginTop: 2 },
  kpiSub: { color: colors.textSubtle, fontSize: 11, lineHeight: 15, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.5), marginBottom: spacing(1) },
  cardTitle: { color: colors.white, ...typography.bodyStrong, marginBottom: spacing(0.75) },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  cardRowPlain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(0.75) },
  cardKey: { color: colors.textMuted, ...typography.caption, flex: 1, paddingRight: spacing(1) },
  cardVal: { color: colors.white, ...typography.bodyStrong },
  footnote: { color: colors.textSubtle, fontSize: 11, lineHeight: 16, marginTop: spacing(1), marginBottom: spacing(1) },
  empty: { color: colors.textSubtle, ...typography.body, textAlign: 'center', backgroundColor: colors.surface, borderRadius: radii.medium, padding: spacing(3) },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginBottom: spacing(1) },
  barLabel: { width: 52, color: colors.textMuted, ...typography.caption },
  barLabelPartial: { fontStyle: 'italic' },
  barBody: { flex: 1 },
  barTrack: { height: 12, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, overflow: 'hidden', flexDirection: 'row' },
  barSub: { color: colors.textSubtle, fontSize: 10, lineHeight: 14, marginTop: 3 },
  barValue: { minWidth: 56, textAlign: 'right', color: colors.white, ...typography.bodyStrong },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  heatHead: { color: colors.textSubtle, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  heatLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  heatCohort: { width: 72, textAlign: 'left' },
  heatSize: { width: 30, textAlign: 'center' },
  heatCell: { width: 36, height: 28, marginHorizontal: 1, textAlign: 'center' },
  heatEmpty: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  heatPartial: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.white },
  heatValue: { color: colors.white, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  heatAverageRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  heatStrong: { color: colors.white },
  heatNote: { color: colors.textSubtle, fontSize: 10, lineHeight: 14, marginTop: spacing(1), maxWidth: 320 },
  noticeCard: { flexDirection: 'row', gap: spacing(1.25), backgroundColor: 'rgba(255,176,32,0.08)', borderWidth: 1, borderColor: 'rgba(255,176,32,0.3)', borderRadius: radii.medium, padding: spacing(1.5), marginBottom: spacing(1) },
  noticeTitle: { color: colors.white, ...typography.bodyStrong },
  noticeText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  noticeButton: { alignSelf: 'flex-start', marginTop: spacing(1.25), backgroundColor: colors.warning, borderRadius: radii.pill, paddingHorizontal: spacing(2), paddingVertical: spacing(1), minWidth: 170, alignItems: 'center' },
  noticeButtonText: { color: colors.black, ...typography.bodyStrong },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orange, borderRadius: radii.pill, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.75), marginBottom: spacing(1) },
  addButtonText: { color: colors.black, ...typography.caption },
  spendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(0.75) },
  spendTitle: { color: colors.white, ...typography.bodyStrong },
  spendSub: { color: colors.textSubtle, fontSize: 11, marginTop: 2 },
  spendAmount: { color: colors.white, ...typography.bodyStrong },
  spendDelete: { padding: spacing(0.5) },
  disclaimer: { color: colors.textSubtle, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: spacing(3) },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: radii.large, borderTopRightRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2.5), paddingBottom: spacing(4) },
  modalTitle: { color: colors.white, ...typography.heading, marginBottom: spacing(1) },
  modalLabel: { color: colors.textSubtle, ...typography.overline, marginTop: spacing(1.5), marginBottom: spacing(0.75) },
  modalHint: { color: colors.textSubtle, fontSize: 11, lineHeight: 16, marginTop: spacing(0.75) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(0.75) },
  chip: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.9), backgroundColor: colors.surfaceElevated },
  chipActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { color: colors.textMuted, ...typography.caption },
  chipTextActive: { color: colors.black },
  input: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, color: colors.white, paddingHorizontal: spacing(1.5), paddingVertical: spacing(1.25), fontSize: 15 },
  saveButton: { backgroundColor: colors.orange, borderRadius: radii.medium, minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center', marginTop: spacing(2) },
  saveButtonText: { color: colors.black, ...typography.bodyStrong },
  cancelButton: { alignItems: 'center', paddingVertical: spacing(1.5) },
  cancelButtonText: { color: colors.textMuted, ...typography.bodyStrong },
});
