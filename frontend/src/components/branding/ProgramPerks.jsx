import './ProgramPerks.css';

const PERKS = [
  'Points from your sponsor for safe driving',
  'A catalog of rewards picked by your sponsor',
  'A full history of every point change and why',
];

// Program highlights shown on the dark road panels, each marked with a lane dash.
export default function ProgramPerks({ className = '' }) {
  return (
    <ul className={`program-perks ${className}`.trim()}>
      {PERKS.map((perk) => (
        <li key={perk}>{perk}</li>
      ))}
    </ul>
  );
}
