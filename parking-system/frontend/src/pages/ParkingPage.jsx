import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { dateTime, duration, localToIso, money } from '../format';
import DataTable from '../components/DataTable';
import Load from '../components/Load';
import { useNotify } from '../components/Toasts';
import ExitDialog from './ExitDialog';

// Рабочее место оператора: въезд, план стоянки, автомобили на стоянке, выезд
export default function ParkingPage() {
  const spots = useApi('/api/spots');
  const active = useApi('/api/sessions?active=true');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [exiting, setExiting] = useState(null);

  const reload = () => { spots.reload(); active.reload(); };
  const plateBySpot = Object.fromEntries((active.data ?? []).map((s) => [s.spot_id, s.plate]));
  const spotNumber = Object.fromEntries((spots.data ?? []).map((s) => [s.id, s.number]));

  return (
    <>
      <div className="grid-2">
        <EntryForm spotId={selectedSpot} spotNumber={spotNumber[selectedSpot]} onClearSpot={() => setSelectedSpot(null)} onDone={reload} />
        <section className="card">
          <SpotMap state={spots} plateBySpot={plateBySpot} selected={selectedSpot} onSelect={setSelectedSpot} />
        </section>
      </div>

      <section className="card">
        <div className="head">
          <h2>Сейчас на стоянке</h2>
          <button onClick={reload}>Обновить</button>
        </div>
        <Load state={active}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="Стоянка пуста"
              columns={[
                { key: 'plate', label: 'Госномер' },
                { key: 'spot', label: 'Место', render: (r) => `№${spotNumber[r.spot_id] ?? r.spot_id}` },
                { key: 'entry_time', label: 'Въезд', render: (r) => dateTime(r.entry_time) },
                { key: 'duration', label: 'На стоянке', render: (r) => duration(r.entry_time) },
              ]}
              actions={(row) => <button className="primary" onClick={() => setExiting(row)}>Выезд</button>}
            />
          )}
        </Load>
      </section>

      {exiting && <ExitDialog session={exiting} onClose={() => { setExiting(null); reload(); }} />}
    </>
  );
}

function EntryForm({ spotId, spotNumber, onClearSpot, onDone }) {
  const notify = useNotify();
  const [plate, setPlate] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [car, setCar] = useState(null);
  const [busy, setBusy] = useState(false);

  // Автозаполнение по госномеру (ФТ-7): запрос к clients-service с задержкой ввода
  useEffect(() => {
    setCar(null);
    if (plate.replace(/\s/g, '').length < 6) return undefined;
    const timer = setTimeout(async () => {
      try {
        setCar(await api(`/api/cars/by-plate/${encodeURIComponent(plate)}`));
      } catch (err) {
        setCar({ error: err });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [plate]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api('/api/sessions/entry', {
        method: 'POST',
        body: { plate, spot_id: spotId ?? undefined, entry_time: localToIso(entryTime) },
      });
      notify.ok(`Въезд ${result.car.plate} зарегистрирован: место №${result.spot.number}, тариф «${result.tariff.name}»`);
      setPlate('');
      setEntryTime('');
      onClearSpot();
      onDone();
    } catch (err) {
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Регистрация въезда</h2>
      <label>Госномер
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123ВС777" required />
      </label>
      {car && !car.error && (
        <div className="owner">
          <b>{car.brand} {car.model}</b>, {car.color}<br />
          Владелец: {car.client.full_name}, {car.client.phone}<br />
          {car.discount ? <>Скидка: {car.discount.name} ({car.discount.percent} %)</> : 'Без скидки'}
        </div>
      )}
      {car?.error && <div className="owner error">{car.error.message}</div>}
      <div className="owner">
        Место: {spotId ? <b>№{spotNumber}</b> : 'первое свободное'}
        {spotId ? <> · <button type="button" className="link" onClick={onClearSpot}>сбросить</button></> : <span className="muted"> (или выберите на плане)</span>}
      </div>
      <label>Время въезда (по умолчанию — текущее)
        <input type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
      </label>
      <button className="primary" disabled={busy}>Зарегистрировать въезд</button>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Пример из ЛР № 1: А123ВС777, въезд 23.09.2026 08:40, выезд 13:05 → {money(360)} + долг {money(150)}.
      </p>
    </form>
  );
}

// План стоянки с цветовой индикацией занятости (ФТ-15)
function SpotMap({ state, plateBySpot, selected, onSelect }) {
  return (
    <>
      <div className="head">
        <h2>План стоянки</h2>
        <div className="legend">
          <span><i style={{ background: 'var(--free)' }} />Свободно</span>
          <span><i style={{ background: 'var(--busy)' }} />Занято</span>
        </div>
      </div>
      <Load state={state}>
        {(spots) => {
          const zones = Object.groupBy(spots, (s) => s.zone);
          const free = spots.filter((s) => s.status === 'FREE').length;
          return (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Свободно {free} из {spots.length}</p>
              {Object.entries(zones).map(([zone, list]) => (
                <div className="zone" key={zone}>
                  <h3>{zone}</h3>
                  <div className="spots">
                    {list.sort((a, b) => a.number - b.number).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`spot ${s.status === 'OCCUPIED' ? 'busy' : ''} ${selected === s.id ? 'selected' : ''}`}
                        disabled={s.status === 'OCCUPIED'}
                        title={s.status === 'OCCUPIED' ? `Занято: ${plateBySpot[s.id] ?? ''}` : 'Выбрать для въезда'}
                        onClick={() => onSelect(selected === s.id ? null : s.id)}
                      >
                        {s.number}
                        <small>{s.status === 'OCCUPIED' ? plateBySpot[s.id] ?? 'занято' : 'свободно'}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          );
        }}
      </Load>
    </>
  );
}
