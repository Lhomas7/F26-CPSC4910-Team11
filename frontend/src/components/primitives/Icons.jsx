function SvgIcon({ children, size = 20, ...props }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size} {...props}>
      {children}
    </svg>
  );
}

export function UserIcon(props) {
  return (
    <SvgIcon {...props}>
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function AccountIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function SignOutIcon(props) {
  return (
    <SvgIcon {...props}>
      <path
        d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="m15 8 4 4-4 4M19 12H9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <SvgIcon {...props}>
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function SearchIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m15.5 15.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function ArrowRightIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h13" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path
        d="m13 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function HomeIcon(props) {
  return (
    <SvgIcon {...props}>
      <path
        d="m3 10.5 9-7.5 9 7.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M5.5 9.5V20h13V9.5" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </SvgIcon>
  );
}

export function PointsIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5v9M9.5 10h4a1.8 1.8 0 0 1 0 3.6h-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function DriversIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 19a6 6 0 0 1 12 0M16.5 5.6a3.2 3.2 0 0 1 0 5.9M18 19a6 6 0 0 0-2.3-4.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function UsersIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3.5 20a5.5 5.5 0 0 1 11 0M14.5 15.2A4.5 4.5 0 0 1 21 19"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function InfoIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="12" cy="7.8" fill="currentColor" r="1" />
    </SvgIcon>
  );
}

export function SignInIcon(props) {
  return (
    <SvgIcon {...props}>
      <path
        d="M14 5h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="m9 8 4 4-4 4M13 12H3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

export function ViewingAsIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 14c.5-2.2 2-3.4 4.5-3.4 1.2 0 2.2.3 3 .8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="17" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12.5 23c.5-2.2 2-3.4 4.5-3.4s4 1.2 4.5 3.4M14 5h6m0 0-2-2m2 2-2 2M10 19H4m0 0 2 2m-2-2 2-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </SvgIcon>
  );
}
