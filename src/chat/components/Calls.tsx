// Кнопки звонка живым людям: закреплены над полем ввода в кризисе и стоят в листе «Помощь».
import { CALLS } from '../types';

export function Calls() {
  return (
    <>
      {CALLS.map((c) => (
        <a class={c.urgent ? 'call urgent' : 'call'} href={c.href} key={c.href}>
          <span><small>{c.label}</small><b>{c.num}</b></span>
          <i aria-hidden="true" />
        </a>
      ))}
    </>
  );
}
