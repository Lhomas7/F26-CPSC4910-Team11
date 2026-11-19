import { useState } from 'react';

import SelectMenu from 'components/forms/SelectMenu';
import useDriverPointsRefresh from 'features/cart/useDriverPointsRefresh';
import { useActiveSponsor } from '../ActiveSponsorContext';
import useSwitchBlocked from '../useSwitchBlocked';
import '../Sponsors.css';

const points = new Intl.NumberFormat();

/** Which sponsor's catalog, cart, and points the driver is using. */
export default function SponsorSwitcher() {
  const sponsors = useActiveSponsor();
  const cartBusy = useSwitchBlocked();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  useDriverPointsRefresh(sponsors?.reload ?? (() => {}));

  if (!sponsors?.activeSponsor) return null;
  const { approved, activeSponsor, switchSponsor } = sponsors;

  if (approved.length === 1) {
    return (
      <div className="sponsor-switcher">
        <span className="sponsor-switcher-label">Shopping with</span>
        <strong className="sponsor-switcher-name">{activeSponsor.sponsor.name}</strong>
      </div>
    );
  }

  const choose = async (value) => {
    const sponsorId = Number(value);
    if (switching || sponsorId === activeSponsor.sponsor.id) return;
    setSwitching(true);
    setError('');
    try {
      const next = await switchSponsor(sponsorId);
      const chosen = next.memberships.find((membership) => membership.sponsor.id === sponsorId);
      setAnnouncement(`Now using ${chosen?.sponsor.name ?? 'the selected sponsor'}.`);
    } catch (failure) {
      setError(failure.message || 'Could not switch sponsors.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="sponsor-switcher">
      <span className="sponsor-switcher-label">Shopping with</span>
      <SelectMenu
        className="sponsor-switcher-menu"
        label="Shopping with sponsor"
        value={activeSponsor.sponsor.id}
        disabled={switching || cartBusy}
        onChange={choose}
        options={approved.map((membership) => ({
          value: membership.sponsor.id,
          label: membership.sponsor.name,
          meta: `${points.format(membership.point_balance ?? 0)} pts`,
        }))}
      />
      {cartBusy && !switching && (
        <small className="sponsor-switcher-note">Finish your purchase to switch.</small>
      )}
      {error && (
        <small className="sponsor-switcher-error" role="alert">
          {error}
        </small>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
