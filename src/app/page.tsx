import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui';
import ambulance from '@/assets/landing/ambulance.jpg';
import clinician from '@/assets/landing/clinician.jpg';
import corridor from '@/assets/landing/corridor.jpg';
import driverPhone from '@/assets/landing/driver-phone.png';
import nairobi from '@/assets/landing/nairobi.jpg';
import reports from '@/assets/landing/reports.png';
import scrubs from '@/assets/landing/scrubs.jpg';
import stepAccept from '@/assets/landing/step-accept.png';
import stepDispatch from '@/assets/landing/step-dispatch.png';
import stepFindBed from '@/assets/landing/step-find-bed.png';
import stepTrack from '@/assets/landing/step-track.png';

// Problem figures from the Afyaline problem statement (docs/problem-statement.md).
const PROBLEM = [
  { value: '25', text: 'public hospitals in Kenya offer ICU care' },
  { value: '90%', text: 'of Level 4 hospitals have no ICU or HDU' },
  { value: '60 min', text: 'ambulance response, against a 15–20 min target' },
  { value: '67%', text: 'of referring hospitals did not call ahead (KNH study)' },
];

const STEPS: { who: string; title: string; text: string; image: StaticImageData; alt: string }[] = [
  {
    who: 'Referring hospital',
    title: 'Find a bed in minutes',
    text: 'Describe the patient and the service they need. Hospitals with free beds appear instantly, nearest first. Choose one and send.',
    image: stepFindBed,
    alt: 'List of hospitals with free maternity beds, distance and a call button',
  },
  {
    who: 'Receiving hospital',
    title: 'Accept before the patient moves',
    text: 'The receiving team is alerted at once, sees the patient brief and accepts. A decline goes back with a reason, and the next hospital is asked in seconds.',
    image: stepAccept,
    alt: 'Incoming transfer request with patient details and an Accept patient button',
  },
  {
    who: 'Ambulance provider',
    title: 'Dispatch the right ambulance',
    text: 'The nearest ambulance with the right equipment is requested. The provider confirms the vehicle and driver in one tap.',
    image: stepDispatch,
    alt: 'Ambulance provider choosing an ambulance and driver, then Confirm and dispatch',
  },
  {
    who: 'Everyone',
    title: 'Track it to the door, then hand over',
    text: 'Both hospitals watch the ambulance on the map with the time to arrival. The receiving hospital confirms the handover, and the record is complete.',
    image: stepTrack,
    alt: 'Live map showing the ambulance, the pickup hospital and the destination',
  },
];

const AUDIENCE = [
  {
    title: 'Hospitals',
    text: 'Send and receive patients, keep bed availability current, and confirm every handover.',
    image: clinician,
    alt: 'A clinician caring for a patient',
  },
  {
    title: 'Ambulance providers',
    text: 'Register ambulances, equipment and drivers. Receive requests and dispatch in one tap.',
    image: ambulance,
    alt: 'An ambulance with its lights on, moving at speed',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="flex gap-2">
            <Link href="/login" className={buttonClass('ghost')}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass('primary')}>
              Register
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white pt-28 pb-20 sm:pt-32 lg:pb-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">
              Patient transfers for Kenya
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              The right hospital. The right ambulance. No phone chains.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Afyaline connects hospitals and ambulance providers in one live workflow, from finding
              a bed to confirming the handover.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass('primary', 'px-6 py-3 text-base')}>
                Register your organization
              </Link>
              <Link
                href="#how-it-works"
                className={buttonClass('secondary', 'px-6 py-3 text-base')}
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-2xl">
              <Image
                src={corridor}
                alt="A nurse moving a newborn's incubator along a hospital corridor"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover"
              />
            </div>
            {/* The driver's phone, floating over the photo */}
            <div className="absolute -bottom-12 -left-3 w-32 overflow-hidden rounded-[1.4rem] border-4 border-ink bg-ink shadow-2xl sm:-left-8 sm:w-44">
              <Image
                src={driverPhone}
                alt="The Afyaline driver screen on a phone"
                placeholder="blur"
                sizes="176px"
              />
            </div>
            {/* A live alert, as hospitals see it */}
            <div className="absolute -top-5 right-2 hidden max-w-[15rem] sm:block rounded-xl bg-white p-3 text-sm shadow-xl ring-1 ring-slate-200 sm:-right-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                New transfer request
              </p>
              <p className="mt-1 font-semibold">Critical · Maternity</p>
              <p className="text-xs text-slate-500">Kiambu Valley Hospital · just now</p>
            </div>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="relative isolate overflow-hidden bg-ink py-20 text-white">
        <Image
          src={scrubs}
          alt=""
          fill
          placeholder="blur"
          sizes="100vw"
          className="-z-10 object-cover opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/90 to-ink/60" />
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
            Kenya&apos;s problem is coordination more than capacity.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Today a doctor phones hospital after hospital for a bed, then phones again for an
            ambulance. Nobody sees the whole journey, so nobody can measure or improve it.
          </p>
          <dl className="mt-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {PROBLEM.map((p) => (
              <div key={p.text} className="border-l-2 border-brand-500 pl-4">
                <dt className="text-3xl font-bold text-white sm:text-4xl">{p.value}</dt>
                <dd className="mt-2 text-sm text-slate-300">{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* How it works: real screens */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold sm:text-4xl">How a transfer works</h2>
          <p className="mt-3 text-lg text-slate-600">
            Four steps, one shared record. These are the real Afyaline screens.
          </p>
        </div>
        <div className="mt-16 space-y-20 lg:space-y-28">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <span className="text-6xl font-bold text-brand-200">{i + 1}</span>
                <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-brand-700">
                  {step.who}
                </p>
                <h3 className="mt-2 text-2xl font-bold sm:text-3xl">{step.title}</h3>
                <p className="mt-4 text-lg text-slate-600">{step.text}</p>
              </div>
              <div
                className={`flex justify-center rounded-3xl bg-brand-50 p-4 sm:p-8 ${i % 2 ? 'lg:order-1' : ''}`}
              >
                <Image
                  src={step.image}
                  alt={step.alt}
                  placeholder="blur"
                  sizes="(min-width: 1024px) 520px, 100vw"
                  className="h-auto max-h-[28rem] w-auto max-w-full rounded-xl object-contain shadow-xl ring-1 ring-slate-200"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it is for */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">Built for everyone on the journey</h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {AUDIENCE.map((a) => (
              <div
                key={a.title}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={a.image}
                    alt={a.alt}
                    fill
                    placeholder="blur"
                    sizes="(min-width: 768px) 360px, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold">{a.title}</h3>
                  <p className="mt-2 text-slate-600">{a.text}</p>
                </div>
              </div>
            ))}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="relative flex aspect-[4/3] items-end justify-center overflow-hidden bg-brand-700">
                <Image
                  src={driverPhone}
                  alt="The driver screen: the patient, one button per step, the route"
                  placeholder="blur"
                  sizes="200px"
                  className="w-40 translate-y-12 rounded-t-2xl border-4 border-b-0 border-ink shadow-2xl"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold">Drivers</h3>
                <p className="mt-2 text-slate-600">
                  One screen on any phone: the patient, the route, one button per step. No app store
                  needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Measured */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Every minute and every shilling, measured
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Time to acceptance, dispatch, pickup and handover. Distance, fuel and consumables for
            every transfer, recorded automatically for every hospital, provider and county.
          </p>
          <p className="mt-4 text-lg text-slate-600">
            Decisions on beds, fleets and budgets finally rest on real data.
          </p>
        </div>
        <div className="rounded-3xl bg-brand-50 p-4 sm:p-6 lg:col-span-3">
          <Image
            src={reports}
            alt="Afyaline reports: transfers per day, time per stage and costs"
            placeholder="blur"
            sizes="(min-width: 1024px) 680px, 100vw"
            className="h-auto w-full rounded-xl shadow-xl ring-1 ring-slate-200"
          />
        </div>
      </section>

      {/* Call to action */}
      <section className="relative isolate overflow-hidden py-24 text-white">
        <Image
          src={nairobi}
          alt="The Nairobi skyline at sunset"
          fill
          placeholder="blur"
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-brand-900/75" />
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Join the Afyaline network</h2>
          <p className="mt-3 text-lg text-brand-100">
            Hospitals and ambulance providers register in two minutes.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex rounded-lg bg-white px-6 py-3 font-semibold text-brand-800 hover:bg-brand-50"
          >
            Register your organization
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500">
        <Logo />
        <p>
          © {new Date().getFullYear()} Afyaline · Photos from{' '}
          <a href="https://unsplash.com" className="hover:underline">
            Unsplash
          </a>
          : Hush Naidoo Jade Photography, CDC, Nappy, Yanghong Yu, Amani Nation
        </p>
      </footer>
    </div>
  );
}
