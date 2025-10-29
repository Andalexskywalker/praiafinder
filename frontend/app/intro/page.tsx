"use client";

// app/intro/page.tsx
// Página de introdução com hero + animações ao fazer scroll

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import { MapPin, Navigation, Filter, Stars } from "lucide-react";

const APP_PATH = "/home"; // destino da app principal — altera aqui se necessário

function GeoIcon() {
  return (
    <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white overflow-visible">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-xl ring-2 ring-teal-300"
        initial={{ opacity: 0.8, scale: 1 }}
        animate={{ opacity: 0, scale: 1.8 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-xl ring-2 ring-teal-300"
        initial={{ opacity: 0.6, scale: 1 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
      />
      <MapPin size={18} />
    </div>
  );
}

function StepCard({
  icon,
  title,
  desc,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay }}
      className="rounded-2xl bg-white shadow-sm ring-1 ring-black/10 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600 mt-1">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function IntroPage() {
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: stickyRef, offset: ["start end", "end start"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, -120]), { stiffness: 100, damping: 20 });
  const rotate = useTransform(scrollYProgress, [0, 1], [0, -6]);
  const glow = useTransform(scrollYProgress, [0, 1], [0.3, 0.7]);

  return (
    <div className="min-h-screen w-full bg-slate-100">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-teal-800 via-cyan-800 to-sky-900 text-white">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(60%_60%_at_20%_0%,rgba(45,212,191,.35),transparent_60%)]" />
        <div className="mx-auto max-w-[1100px] px-4 py-16 sm:py-20">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="rounded-2xl bg-white/10 ring-1 ring-white/20 p-3">
              <Image src="/icon-512.png" alt="PraiaFinder" width={64} height={64} priority />
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">PraiaFinder</h1>
            <p className="max-w-[58ch] text-white/90">
              Encontra a praia ideal <span className="font-semibold">agora</span> — recomendações por localização ou zona, com
              nota 0–10 e fatores que importam.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={APP_PATH}
                className="inline-flex items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-white font-semibold shadow-sm ring-1 ring-teal-400/30 hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Começar
              </Link>
              <a href="#como-funciona" className="text-white/90 hover:text-white">Como funciona</a>
            </div>
            <div className="mt-10 text-white/80 text-sm">Desliza para perceber em 20 segundos.</div>
          </div>
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 animate-bounce pointer-events-none">↓</div>
      </section>

      {/* SCROLL ANIMATION / COMO FUNCIONA */}
      <section id="como-funciona" className="relative">
        <div className="mx-auto max-w-[1100px] px-4 py-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* Texto + passos */}
          <div className="space-y-4 lg:order-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Como funciona</h2>
            <p className="text-slate-600">Simples e rápido — 4 passos e já estás com o pé na areia.</p>
            <div className="grid gap-3">
              <StepCard icon={<GeoIcon />} title="Permitir localização" desc="Toca em Perto de mim (ou escolhe a zona). Define o dia e a janela (manhã/tarde)." />
              <StepCard icon={<Navigation size={18} />} title="Recebe recomendações com nota" desc="Ordena por nota (0–10) ou distância. Em fluvial, mostramos Corrente; em mar, Ondas." delay={0.05} />
              <StepCard icon={<Filter size={18} />} title="Filtra por tipo de praia" desc="Escolhe: Todas, Mar ou Fluvial. Ordena por Nota ou Distância." delay={0.1} />
              <StepCard icon={<Stars size={18} />} title="Abre o cartão e vê o detalhe" desc="Breakdown dos fatores, previsão e distância. Tudo o que interessa para escolher bem." delay={0.15} />
            </div>
          </div>

          {/* Mockup sticky animado (também em mobile) */}
          <div ref={stickyRef} className="relative lg:order-2">
            <div className="sticky top-16">
              <motion.div style={{ y, rotate }} className="relative mx-auto w-[min(92%,420px)]">
                <div className="rounded-[28px] bg-white shadow-xl ring-1 ring-black/10 p-4">
                  <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-sky-700 p-6 text-white">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white/10 ring-1 ring-white/20 p-2">
                        <Image src="/icon-512.png" alt="" width={40} height={40} />
                      </div>
                      <div>
                        <div className="text-lg font-bold">PraiaFinder</div>
                        <div className="text-xs text-teal-50/90">Encontra a praia ideal agora</div>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-white/10 px-2 py-1 text-center">Perto</div>
                      <div className="rounded-lg bg-white/10 px-2 py-1 text-center">Zonas</div>
                      <div className="rounded-lg bg-white/10 px-2 py-1 text-center">Hoje · 09–12</div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="rounded-xl bg-slate-50 ring-1 ring-black/5 p-3">
                      <div className="h-2 w-full rounded bg-slate-200">
                        <div className="h-2 w-[62%] rounded bg-emerald-500" />
                      </div>
                      <div className="mt-3 grid gap-2">
                        {["Nazaré", "São Martinho do Porto", "São Pedro de Moel"].map((n, i) => (
                          <div key={i} className="rounded-lg bg-white ring-1 ring-black/10 p-2 text-sm text-slate-700 flex items-center justify-between">
                            <span>{n}</span>
                            <span className="rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800">Nota {(7.8 - i * 0.6).toFixed(1)}/10</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <motion.div style={{ opacity: glow }} className="pointer-events-none absolute -inset-4 rounded-[32px] bg-teal-500/10 blur-2xl" />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16">
        <div className="mx-auto max-w-[1100px] px-4">
          <div className="rounded-3xl bg-gradient-to-br from-teal-600 to-sky-700 text-white p-6 md:p-8 ring-1 ring-black/10 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold tracking-tight">Pronto para escolher a praia?</h3>
                <p className="text-white/85">Abre a app e vê as recomendações para já.</p>
              </div>
              <Link href={APP_PATH} className="inline-flex items-center justify-center rounded-xl bg-white text-teal-700 px-5 py-3 font-semibold ring-1 ring-white/60 hover:bg-white/90">
                Começar agora
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
