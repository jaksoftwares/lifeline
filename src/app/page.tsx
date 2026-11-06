import Link from 'next/link';
import {
  Ambulance,
  BarChart3,
  ClipboardCheck,
  Hospital,
  MapPinned,
  PhoneOff,
  Route,
  Timer,
  Wallet,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui';

// Figures from the Afyaline problem statement (docs/problem-statement.md).
const PROBLEM = [
  { value: '25', text: 'public hospitals in Kenya offer ICU care' },
  { value: '90%', text: 'of Level 4 hospitals have no ICU or HDU' },
  { value: '60 min', text: 'ambulance response, against a 15–20 minute target' },
  { value: '67%', text: 'of referring hospitals did not call ahead (KNH study)' },
];

const STEPS = [
  {
    icon: Hospital,
    title: 'Find a bed in minutes',
    text: 'The referring hospital sees which hospitals have the service and beds the patient needs, and sends the patient brief in one step.',
  },
  {
    icon: ClipboardCheck,
    title: 'Accepted before the patient moves',
    text: 'The receiving hospital is alerted instantly and accepts or declines. A decline is redirected to another hospital in seconds.',
  },
  {
    icon: Ambulance,
    title: 'The right ambulance, dispatched',
    text: 'The nearest available ambulance with the right equipment is requested, and the provider assigns a driver.',
  },
  {
    icon: MapPinned,
    title: 'Tracked to the door',
    text: 'The driver follows the fastest route. Both hospitals watch the ambulance live and confirm the handover on arrival.',
  },
];

const IMPACT = [
  {
    icon: PhoneOff,
    title: 'No more phone chains',
    text: 'One shared record replaces calls to hospitals and ambulance services.',
  },
  {
    icon: Timer,
    title: 'Every minute measured',
    text: 'Time to acceptance, dispatch, pickup and handover, recorded automatically.',
  },
  {
    icon: Route,
    title: 'Better routes',
    text: 'Road routing and live position for every trip, on any phone.',
  },
  {
    icon: Wallet,
    title: 'Known costs',
    text: 'Fuel, consumables and distance per transfer, per provider and per county.',
  },
  {
    icon: BarChart3,
    title: 'Evidence for decisions',
    text: 'Dashboards for hospitals, providers and counties to plan capacity and fleets.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className={buttonClass('ghost')}>
            Sign in
          </Link>
          <Link href="/register" className={buttonClass('primary')}>
            Register
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">
          Patient transfer coordination for Kenya
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Get critical patients to the right hospital, faster.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Afyaline connects referring hospitals, receiving hospitals and ambulance providers in one
          live workflow, from finding a bed to confirming the handover. It saves time, money and
          lives.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className={buttonClass('primary', 'px-6 py-3 text-base')}>
            Register your organization
          </Link>
          <Link href="/login" className={buttonClass('secondary', 'px-6 py-3 text-base')}>
            Sign in
          </Link>
        </div>
      </section>

      <section className="bg-brand-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="max-w-2xl text-2xl font-bold sm:text-3xl">
            Kenya&apos;s problem is coordination more than capacity.
          </h2>
          <p className="mt-3 max-w-2xl text-brand-100">
            Referring teams still phone around for beds, specialists and equipment, then phone again
            for transport. Nobody sees the whole journey.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-4">
            {PROBLEM.map((p) => (
              <div key={p.text}>
                <dt className="text-4xl font-bold text-brand-200">{p.value}</dt>
                <dd className="mt-2 text-sm text-brand-100">{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold text-brand-700">STEP {i + 1}</p>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">What changes</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {IMPACT.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <Icon className="h-6 w-6 text-brand-600" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Hospitals',
              text: 'Send and receive patients, keep bed availability current, and confirm handovers.',
            },
            {
              title: 'Ambulance providers',
              text: 'Register ambulances, equipment and drivers. Receive requests and dispatch in one tap.',
            },
            {
              title: 'Drivers',
              text: 'One screen on any phone: the patient, the route, one button per step. No app store needed.',
            },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-brand-600 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold">Join the Afyaline network</h2>
          <p className="mt-2 text-brand-50">Registration takes two minutes. Start right away.</p>
          <Link
            href="/register"
            className="mt-6 inline-flex rounded-lg bg-white px-6 py-3 font-semibold text-brand-800 hover:bg-brand-50"
          >
            Register your organization
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-6 py-8 text-sm text-slate-500">
        <Logo />
        <p>© {new Date().getFullYear()} Afyaline</p>
      </footer>
    </div>
  );
}
