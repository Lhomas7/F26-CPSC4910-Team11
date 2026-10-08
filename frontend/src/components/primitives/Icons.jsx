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
