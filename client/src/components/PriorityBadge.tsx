interface PriorityBadgeProps {
  priority?: number;
}

const priorityConfig: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: '最高', emoji: '🔴', color: '#dc2626' },
  2: { label: '高', emoji: '🟠', color: '#ea580c' },
  3: { label: '中', emoji: '🟡', color: '#ca8a04' },
  4: { label: '低', emoji: '🟢', color: '#16a34a' },
  5: { label: '最低', emoji: '🔵', color: '#2563eb' }
};

function PriorityBadge({ priority = 3 }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig[3];

  return (
    <span
      style={{
        fontSize: '11px',
        color: config.color,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px'
      }}
    >
      {config.emoji} {config.label}
    </span>
  );
}

export default PriorityBadge;
