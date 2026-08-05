import './MonthCalendar.css';

interface Props {
  year: number;
  month: number; // 0-indexed
  selectedDate: string;
  datesWithServices: Set<string>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toISODate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayISO() {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function MonthCalendar({
  year,
  month,
  selectedDate,
  datesWithServices,
  onSelectDate,
  onChangeMonth,
}: Props) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();

  const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  function prevMonth() {
    if (month === 0) onChangeMonth(year - 1, 11);
    else onChangeMonth(year, month - 1);
  }

  function nextMonth() {
    if (month === 11) onChangeMonth(year + 1, 0);
    else onChangeMonth(year, month + 1);
  }

  const cells: Array<{ day: number; iso: string } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: toISODate(year, month, day) });
  }

  return (
    <div className="card month-calendar">
      <div className="calendar-header">
        <button type="button" className="btn btn-secondary calendar-nav" onClick={prevMonth}>
          ←
        </button>
        <h2 className="calendar-title">{monthLabel}</h2>
        <button type="button" className="btn btn-secondary calendar-nav" onClick={nextMonth}>
          →
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="calendar-cell empty" />;
          }

          const isSelected = cell.iso === selectedDate;
          const isToday = cell.iso === today;
          const hasServices = datesWithServices.has(cell.iso);

          return (
            <button
              key={cell.iso}
              type="button"
              className={[
                'calendar-cell',
                isSelected ? 'selected' : '',
                isToday ? 'today' : '',
                hasServices ? 'has-services' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(cell.iso)}
            >
              <span className="calendar-day">{cell.day}</span>
              {hasServices && <span className="calendar-dot" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
