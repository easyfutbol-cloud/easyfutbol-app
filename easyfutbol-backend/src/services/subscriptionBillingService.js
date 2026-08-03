const madridParts = (date = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
);

const timeZoneOffsetMs = (date, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))-date.getTime();
};

const nextMadridFirstTimestamp = (now = new Date()) => {
  const parts=madridParts(now); let year=Number(parts.year),month=Number(parts.month)+1;
  if (month===13) { month=1; year+=1; }
  const utcGuess=Date.UTC(year,month-1,1,0,5,0);
  const offset=timeZoneOffsetMs(new Date(utcGuess),'Europe/Madrid');
  return Math.floor((utcGuess-offset)/1000);
};

export const getFirstDayBillingConfig = (now = new Date()) => {
  if (Number(madridParts(now).day)===1) return { renewalAnchor: null };
  return { renewalAnchor: nextMadridFirstTimestamp(now) };
};

export const getRenewalAlignmentUpdate = (subscription, now = new Date()) => {
  const renewalAnchor = Number(subscription?.metadata?.renewalAnchor || 0);
  if (!renewalAnchor || renewalAnchor <= Math.floor(now.getTime() / 1000)) return null;
  if (subscription?.metadata?.renewalAligned === 'true') return null;
  return {
    trial_end: renewalAnchor,
    proration_behavior: 'none',
    metadata: { renewalAligned: 'true' },
  };
};
