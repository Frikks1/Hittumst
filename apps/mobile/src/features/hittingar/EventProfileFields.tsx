import { FilterSection, GenderChoices, DiagnosisChoices } from '@/components/DiscoveryControls';
import { useState } from 'react';
import { View } from 'react-native';
import { identitySchema, type MeetupEventProfile } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';

export function EventProfileFields({ value, onChange, section }: { value: MeetupEventProfile; onChange: (value: MeetupEventProfile) => void; section: 'information' | 'admission' }) {
  const { discoveryEnabled, t, theme } = useApp();
  const [advanced, setAdvanced] = useState(false);
  const [tag, setTag] = useState('');
  const set = <K extends keyof MeetupEventProfile>(key: K, next: MeetupEventProfile[K]) => onChange({ ...value, [key]: next });
  const addTag = (text: string) => {
    const next = text.trim();
    if (next && next.length <= 40 && value.customTags.length < 20 && !value.customTags.some(item => item.toLocaleLowerCase() === next.toLocaleLowerCase())) set('customTags', [...value.customTags, next]);
    setTag('');
  };
  const heading = (label: string) => <Text style={[textStyles.heading, { color: theme.colors.text }]}>{label}</Text>;
  return <View style={{ gap: 14 }}>
    {section === 'information' ? <>
      {heading(t('event.tags'))}
      <Text style={{ color: theme.colors.textMuted }}>{t('event.tagHint')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{value.customTags.map(item => <ChoiceChip key={item} selected label={`${item} ×`} onPress={() => set('customTags', value.customTags.filter(x => x !== item))} />)}</View>
      <Field label={t('event.tags')} value={tag} onChangeText={setTag} maxLength={40} placeholder="Gaming, Outdoors, Online, Dungeons and Dragons" onSubmitEditing={() => addTag(tag)} />
      <Button label={t('event.addTag')} variant="secondary" disabled={!tag.trim() || value.customTags.length >= 20} onPress={() => addTag(tag)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['Gaming', 'Outdoors', 'Online', 'Dungeons and Dragons', 'Photography', 'Music', 'Books'].filter(item => !value.customTags.includes(item)).map(item => <ChoiceChip key={item} selected={false} label={`+ ${item}`} onPress={() => addTag(item)} />)}</View>
      <Field label={t('event.rules')} value={value.rules} onChangeText={text => set('rules', text)} multiline maxLength={4000} />
      <Field label={t('event.prerequisites')} value={value.prerequisites} onChangeText={text => set('prerequisites', text)} multiline maxLength={4000} />
      {value.sections.map((item, index) => <View key={index} style={{ padding: 16, gap: 10, borderRadius: 18, backgroundColor: theme.colors.surface }}>
        <Field label={t('event.sectionTitle')} value={item.title} maxLength={80} onChangeText={title => set('sections', value.sections.map((x, i) => i === index ? { ...x, title } : x))} />
        <Field label={t('event.sectionBody')} value={item.body} maxLength={4000} multiline onChangeText={body => set('sections', value.sections.map((x, i) => i === index ? { ...x, body } : x))} />
        <Button label={t('event.remove')} variant="ghost" onPress={() => set('sections', value.sections.filter((_, i) => i !== index))} />
      </View>)}
      <Button label={t('event.addSection')} variant="secondary" disabled={value.sections.length >= 6} onPress={() => set('sections', [...value.sections, { title: '', body: '' }])} />
    </> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['public', 'request', 'invite'] as const).map(mode => <ChoiceChip key={mode} label={t(`event.${mode}`)} selected={value.joinMode === mode} onPress={() => set('joinMode', mode)} />)}</View>
      <FilterSection title={t('diagnosis.advanced')} open={advanced} onPress={() => setAdvanced(!advanced)}>
      {discoveryEnabled&&<>{heading(t('diagnosis.audience'))}<GenderChoices value={value.audienceGenders} onChange={v => set('audienceGenders', v)} />
      {heading(t('diagnosis.title'))}<DiagnosisChoices value={value.requiredDiagnosisIds} onChange={v => set('requiredDiagnosisIds', v)} />
      <Text style={{ color: theme.colors.textMuted }}>{value.requiredDiagnosisIds.length ? t('diagnosis.requiredHelp') : t('diagnosis.none')}</Text></>}
      {heading(t('event.ages'))}
      <Field label={t('event.minAge')} value={String(value.minAge || '')} keyboardType="number-pad" onChangeText={text => set('minAge', Number(text.replace(/\D/g, '')))} />
      <Field label={t('event.maxAge')} value={value.maxAge === null ? '' : String(value.maxAge)} keyboardType="number-pad" placeholder={t('event.unlimited')} onChangeText={text => set('maxAge', text ? Number(text.replace(/\D/g, '')) : null)} />
      {heading(t('event.limits'))}
      <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{t('event.limitHint')}</Text>
      {value.ageLimits.map((rule, index) => <View key={index} style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: theme.colors.surface }}>
        {(['minAge', 'maxAge', 'maxRsvp'] as const).map(key => <Field key={key} label={t(key === 'minAge' ? 'event.from' : key === 'maxAge' ? 'event.to' : 'event.maxRsvp')} value={String(rule[key])} keyboardType="number-pad" onChangeText={text => set('ageLimits', value.ageLimits.map((x, i) => i === index ? { ...x, [key]: Number(text.replace(/\D/g, '')) } : x))} />)}
        <Button label={t('event.remove')} variant="ghost" onPress={() => set('ageLimits', value.ageLimits.filter((_, i) => i !== index))} />
      </View>)}
      <Button label={t('event.ageRule')} variant="secondary" disabled={value.ageLimits.length >= 12} onPress={() => set('ageLimits', [...value.ageLimits, { minAge: 18, maxAge: 25, maxRsvp: 0 }])} />
      {heading(t('event.genderRule'))}
      {identitySchema.options.map(gender => {
        const rule = value.genderLimits.find(item => item.gender === gender);
        return <Field key={gender} label={t(`event.gender.${gender}`)} placeholder={t('event.unlimited')} value={rule ? String(rule.maxRsvp) : ''} keyboardType="number-pad" onChangeText={text => set('genderLimits', [...value.genderLimits.filter(item => item.gender !== gender), ...(text ? [{ gender, maxRsvp: Number(text.replace(/\D/g, '')) }] : [])])} />;
      })}
      </FilterSection>
    </>}
  </View>;
}
