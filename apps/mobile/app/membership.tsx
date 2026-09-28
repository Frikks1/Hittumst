import { useCallback, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TIERS, TIER_IDS, type TierId } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import { api, runtimeEnv } from '@/services';
import {
  restoreSubscriptions, manageSubscriptions, loadSubscriptionCatalog, purchaseSubscription,
  subscriptionConfiguration, syncSubscriptions, type SubscriptionCatalog, type SubscriptionResult,
} from '@/services/subscriptions';

export default function MembershipScreen() {
  const { theme, locale, user } = useApp();
  const is = locale === 'is';
  const router = useRouter();
  const { entitlement, limits, reload, error } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SubscriptionCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [status, setStatus] = useState<SubscriptionResult['status'] | null>(null);
  const revision = useRef(0);
  const pending = useRef<number | null>(null);
  const nativeAvailable = Boolean(subscriptionConfiguration());
  const refreshCatalog = useCallback(async () => {
    const generation = revision.current;
    if (api.isDemo || !user || !nativeAvailable) return;
    try {
      const next = await loadSubscriptionCatalog(user.id);
      if (generation === revision.current) { setCatalog(next); setCatalogFailed(false); }
    } catch { if (generation === revision.current) { setCatalog(null); setCatalogFailed(true); } }
  }, [user, nativeAvailable]);
  useFocusEffect(useCallback(() => {
    revision.current += 1;
    pending.current = null;
    setBusy(false); setFailed(null); setCatalog(null); setCatalogFailed(false); setStatus(null);
    void refreshCatalog();
    return () => { revision.current += 1; };
  }, [refreshCatalog]));

  const action = async (fn: () => Promise<unknown>, subscription = false) => {
    const generation = revision.current;
    if (pending.current === generation) return;
    pending.current = generation; setBusy(true); setFailed(null);
    if (subscription) setStatus(null);
    try {
      const result = await fn();
      if (generation !== revision.current) return;
      if (subscription && result && typeof result === 'object' && 'status' in result) {
        const next = (result as SubscriptionResult).status;
        setStatus(next === 'cancelled' ? null : next);
      }
      await reload();
      await refreshCatalog();
    } catch (failure) {
      if (generation === revision.current) setFailed(failure instanceof Error ? failure.message : 'failed');
    } finally {
      if (pending.current === generation) pending.current = null;
      if (generation === revision.current) setBusy(false);
    }
  };
  const nativeAction = (fn: (accountId: string) => Promise<SubscriptionResult>) => {
    if (user) void action(() => fn(user.id), true);
  };
  const muted = { color: theme.colors.textMuted };
  return (
    <Screen back title={is ? 'Áskrift og fríðindi' : 'Membership'}>
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={muted}>
          {api.isDemo ? (is ? 'Sýnihamur: áskriftir og fjárhæðir eru tilbúnar.' : 'Demo: subscriptions and money are simulated.')
            : catalog?.mode === 'test-store' ? (is ? 'Prufuverslun. Engin raunveruleg greiðsla fer fram.' : 'Test store. No real payment is taken.')
            : catalog?.purchaseAllowed ? (is ? 'Veldu mánaðaráskrift. Verð og greiðsla eru staðfest í appversluninni.' : 'Choose a monthly subscription. Your app store confirms the price and payment.')
            : (is ? 'Ný áskriftarsala er ekki opin. Þú getur endurheimt eða stjórnað fyrri kaupum.' : 'New subscription sales are unavailable. You can restore or manage existing purchases.')}
        </Text>
        {(error || failed || catalogFailed) && <View style={{ gap: 10 }}>
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {failed === 'manage_existing_subscription'
              ? (is ? 'Stjórnaðu fyrri áskrift í versluninni þar sem hún var keypt.' : 'Manage your existing subscription in the store where it was purchased.')
              : failed === 'purchases_unavailable'
                ? (is ? 'Áskriftarsala er ekki opin. Engin ný kaup voru gerð.' : 'Subscription sales are unavailable. No new purchase was made.')
                : (is ? 'Ekki tókst að sækja eða uppfæra upplýsingar. Reyndu aftur.' : 'Unable to load or update information. Please retry.')}
          </Text>
          <Button variant="secondary" disabled={busy} label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void action(async () => undefined)} />
        </View>}
        {status && <Text accessibilityLiveRegion="polite" style={muted}>
          {status === 'payment_pending'
            ? (is ? 'Greiðsla bíður staðfestingar frá versluninni. Ekki kaupa aftur. Fríðindi birtast eftir staðfestingu.' : 'Payment is pending approval by your store. Do not purchase again. Benefits appear after verification.')
            : status === 'verification_pending'
              ? (is ? 'Kaupin bíða staðfestingar. Ekki kaupa aftur. Athugaðu stöðuna hér síðar.' : 'Your purchase is awaiting verification. Do not purchase again. Check its status here shortly.')
              : (is ? 'Staða fríðinda hefur verið uppfærð. Áætluð breyting tekur gildi á dagsetningu sem verslunin sýnir.' : 'Benefits have been refreshed. Scheduled changes take effect on the date shown by your store.')}
        </Text>}
        {entitlement && <Text style={{ color: theme.colors.text }}>
          {limits.name} · {entitlement.albumsUsed}/{limits.albums} {is ? 'albúm' : 'albums'} ·{' '}
          {entitlement.occurrencesUsed}/{limits.occurrences} {is ? 'hittingar stofnaðir í mánuði' : 'meetups hosted this month'} ·{' '}
          {entitlement.joinsUsed}/{limits.joins} {is ? 'hittingar sóttir í mánuði' : 'meetups joined this month'}
        </Text>}
        {TIER_IDS.map(tier => {
          const p = TIERS[tier];
          const product = catalog?.products.find(item => item.tier === tier);
          const current = entitlement?.tier === tier;
          return <View key={tier} style={{ padding: 18, gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, backgroundColor: theme.colors.surface }}>
            <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>{p.name}{current ? (is ? ' · Núverandi' : ' · Current') : ''}</Text>
            <Text style={{ color: theme.colors.text }}>
              {tier === 'plebbi' ? (is ? 'Ókeypis' : 'Free') : product ? product.price + (is ? ' / mánuð' : ' / month')
                : api.isDemo ? p.priceIsk.toLocaleString('is-IS') + (is ? ' kr / mánuð (sýni)' : ' ISK / month (demo)')
                  : (is ? 'Verð í verslun er ekki tiltækt' : 'Store price unavailable')}
            </Text>
            <Text style={{ color: theme.colors.text }}>
              {p.albums} {is ? 'albúm' : 'albums'} · {p.photos} {is ? 'myndir' : 'photos'} + {p.videos} {is ? 'myndskeið í hverju' : 'videos each'}
              {'\n'}{is ? 'Taka þátt í' : 'Join'} {p.joins} · {is ? 'Stofna' : 'Host'} {p.occurrences} {is ? 'hittinga á mánuði' : 'meetups per month'}
              {'\n'}{p.hostBps / 100}% {is ? 'til höfundar' : 'creator share'} · 75% {is ? 'til annarra þátttakenda' : 'to other attendees'}
              {'\n'}{p.tokens} × {p.tokenValueIsk} kr {is ? 'styrktarinneign á mánuði' : 'sponsorship credit per month'}
            </Text>
            {tier !== 'plebbi' && <Text style={muted}>{is ? 'Styrktu eigin hitting eða annarra. Viðbótarstyrkir eru ótakmarkaðir: 10% þjónustugjald á peningahluta, auk greiðsluvinnslu þegar hún á við.' : 'Sponsor your own meetup or someone else’s. Additional sponsorships are unlimited: a 10% service fee on the cash portion, plus processing where applicable.'}</Text>}
            {p.effects && <Text style={{ color: theme.colors.text }}>{is ? 'Sérstök prófíláhrif og áskriftarmerki.' : 'Special profile effects and tenure badge.'}</Text>}
            {api.isDemo && <Button disabled={busy} label={is ? 'Prófa í sýniham' : 'Try in demo'} onPress={() => void action(() => api.setSandboxTier(tier))} />}
            {!api.isDemo && product && !current && <Button disabled={busy || !catalog?.purchaseAllowed || status === 'payment_pending' || status === 'verification_pending'} label={catalog?.mode === 'test-store' ? (is ? 'Prófa áskrift' : 'Test subscription') : (is ? 'Velja áskrift' : 'Choose subscription')} onPress={() => nativeAction(id => purchaseSubscription(id, tier as TierId))} />}
          </View>;
        })}
        {!api.isDemo && <Text style={muted}>
          {is ? 'Áskrift endurnýjast sjálfkrafa í hverjum mánuði þar til henni er sagt upp í appversluninni. Greiðsla og breytingadagsetning birtast áður en þú staðfestir. Breyting á Android tekur gildi við næstu endurnýjun. Eyðing aðgangs segir ekki upp áskrift.'
            : 'Subscriptions renew monthly until cancelled in your app store. Payment and the effective change date are shown before confirmation. Android plan changes take effect at the next renewal. Deleting your account does not cancel your subscription.'}
        </Text>}
        <Text style={muted}>{is ? 'Ónotuð styrktarinneign færist áfram án gildistíma. Virka áskrift þarf til að ráðstafa henni. Hún er aðeins til styrktar hittingum og má hvorki taka út, gefa né nota í verslun. Uppgerðar þátttökutekjur má taka út óháð áskrift.' : 'Unused sponsorship credit rolls over without expiry. An active subscription is required to allocate it. Credit can only sponsor meetups; it cannot be withdrawn, gifted or spent in the shop. Settled attendance earnings are withdrawable on every tier.'}</Text>
        <Text style={muted}>{is ? 'Þátttaka miðast við almanaksmánuð hittingsins á íslenskum tíma. Staðfest þátttaka notar pláss; umsókn í bið gerir það ekki. Að hætta við fyrir upphaf eða aflýstur hittingur losar plássið. Mætingarleysi notar pláss.' : 'Joining limits follow the event’s calendar month in Iceland. Confirmed attendance uses a slot; pending requests do not. Leaving before the start or cancellation releases it. A no-show uses the slot.'}</Text>
        {!api.isDemo && !nativeAvailable && <Text style={muted}>{is ? 'Kaup og endurheimt krefjast uppsetts iOS- eða Android-apps með tengdri verslun.' : 'Purchasing and restoring require the installed iOS or Android app with its store connected.'}</Text>}
        <Button variant="secondary" disabled={busy || api.isDemo || !nativeAvailable} label={is ? 'Endurheimta kaup' : 'Restore purchases'} onPress={() => nativeAction(restoreSubscriptions)} />
        <Button variant="secondary" disabled={busy || api.isDemo || !nativeAvailable} label={is ? 'Stjórna áskrift' : 'Manage subscription'} onPress={() => nativeAction(manageSubscriptions)} />
        {!api.isDemo && <Button variant="secondary" disabled={busy || !user} label={is ? 'Athuga stöðu kaupa' : 'Check purchase status'} onPress={() => nativeAction(syncSubscriptions)} />}
        {runtimeEnv.websiteUrl && (['terms', 'privacy'] as const).map(path => <Button key={path} variant="secondary" label={path === 'terms' ? (is ? 'Skilmálar' : 'Terms of use') : (is ? 'Persónuvernd' : 'Privacy policy')} onPress={() => void action(() => Linking.openURL(runtimeEnv.websiteUrl + '/' + path + (is ? '' : '?lang=en')))} />)}
        <Button label={is ? 'Veski' : 'Wallet'} onPress={() => router.push('/wallet' as never)} />
        {entitlement?.tier === 'plebba_kongur' && <Button disabled={busy} variant="secondary" label={is ? 'Birta prófíláhrif og áskriftarmerki' : 'Show profile effect and tenure badge'} onPress={() => void action(() => api.setPremiumProfile(true, true))} />}
        <Button disabled={busy} variant="secondary" label={is ? 'Fela prófíláhrif og áskriftarmerki' : 'Hide profile effect and tenure badge'} onPress={() => void action(() => api.setPremiumProfile(false, false))} />
      </View>
    </Screen>
  );
}
