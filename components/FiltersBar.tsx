'use client';
import { useFilters } from '@/context/FiltersContext';
import type { AbilityBucket, AgeGroup, Sex } from '@/lib/types';

const sexOptions: Sex[] = ['all', 'male', 'female'];
const ageOptions: AgeGroup[] = ['all', '20-39', '40-44', '45-49', '50-54', '55-59', '60+'];
const abilityOptions: AbilityBucket[] = ['all', '<3:00', '3:00–3:29', '3:30–3:59', '4:00–4:29', '4:30–4:59', '5:00+'];

export default function FiltersBar() {
  const { filters, setSex, setAgeGroup, setAbility, reset } = useFilters();
  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 600 }}>Filters</div>
        <button onClick={reset} aria-label="Reset filters">Reset</button>
      </div>
      <div className="filters" role="group" aria-label="Filters">
        <div>
          <label htmlFor="sex">Sex</label>
          <select id="sex" name="sex" value={filters.sex} onChange={(e) => setSex(e.target.value as Sex)}>
            {sexOptions.map((opt) => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All' : opt[0].toUpperCase() + opt.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="age">Age group</label>
          <select id="age" name="age" value={filters.ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}>
            {ageOptions.map((opt) => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All (20–60+)' : opt}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ability">Personal best</label>
          <select id="ability" name="ability" value={filters.ability} onChange={(e) => setAbility(e.target.value as AbilityBucket)}>
            {abilityOptions.map((opt) => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All abilities' : opt}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
