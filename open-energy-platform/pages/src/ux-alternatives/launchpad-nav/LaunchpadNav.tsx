import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ROLES, getRoleConfig } from './roleData';
import LaunchpadView from './LaunchpadView';
import SubCockpitView from './SubCockpitView';
import FeatureView from './FeatureView';

export type NavLevel = 'launchpad' | 'subcockpit' | 'feature';

export type NavState = {
  role: string;
  level: NavLevel;
  domainKey?: string;
  featureKey?: string;
};

const INITIAL_ROLE = ROLES[0].role;

export default function LaunchpadNav() {
  const [nav, setNav] = useState<NavState>({ role: INITIAL_ROLE, level: 'launchpad' });

  const goToDomain = (domainKey: string) =>
    setNav((s) => ({ ...s, level: 'subcockpit', domainKey, featureKey: undefined }));

  const goToFeature = (featureKey: string) =>
    setNav((s) => ({ ...s, level: 'feature', featureKey }));

  const goToLaunchpad = () =>
    setNav((s) => ({ ...s, level: 'launchpad', domainKey: undefined, featureKey: undefined }));

  const goToSubcockpit = () =>
    setNav((s) => ({ ...s, level: 'subcockpit', featureKey: undefined }));

  const switchRole = (role: string) =>
    setNav({ role, level: 'launchpad' });

  const config = getRoleConfig(nav.role);

  if (!config) return null;

  const levelKey = `${nav.role}-${nav.level}-${nav.domainKey ?? ''}-${nav.featureKey ?? ''}`;

  return (
    <div style={{ minHeight: '100dvh', background: 'oklch(0.96 0.003 250)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <AnimatePresence mode="wait" initial={false}>
        {nav.level === 'launchpad' && (
          <LaunchpadView
            key={`launchpad-${nav.role}`}
            config={config}
            allRoles={ROLES}
            currentRole={nav.role}
            onSelectDomain={goToDomain}
            onSwitchRole={switchRole}
          />
        )}
        {nav.level === 'subcockpit' && nav.domainKey && (
          <SubCockpitView
            key={`subcockpit-${nav.role}-${nav.domainKey}`}
            config={config}
            domainKey={nav.domainKey}
            onSelectFeature={goToFeature}
            onBack={goToLaunchpad}
          />
        )}
        {nav.level === 'feature' && nav.domainKey && nav.featureKey && (
          <FeatureView
            key={`feature-${nav.role}-${nav.domainKey}-${nav.featureKey}`}
            config={config}
            domainKey={nav.domainKey}
            featureKey={nav.featureKey}
            onBack={goToSubcockpit}
            onBackToLaunchpad={goToLaunchpad}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
