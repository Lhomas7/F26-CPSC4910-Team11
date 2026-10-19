import Skeleton from '../../../components/feedback/Skeleton';

export default function DashboardSkeleton({ type = 'card', count = 1 }) {
  if (type === 'stats')
    return (
      <div className="stat-grid" aria-label="Loading summary">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton className="home-skeleton home-skeleton-stat" key={index} />
        ))}
      </div>
    );
  return <Skeleton className={`home-skeleton home-skeleton-${type}`} aria-label="Loading" />;
}
