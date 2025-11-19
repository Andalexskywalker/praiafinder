"use client";

// app/intro/page.tsx
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import { MapPin, Navigation, Filter, Wind, ArrowRight, CheckCircle2, Waves } from "lucide-react";

const APP_PATH = "/home";

// Componente de Fundo com "Blobs" animados
function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-slate-50">
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-400/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-400/20 blur-[120px]" />
      <div className="absolute top-[40%] left-[30%] w-[30vw] h-[30vw] rounded-full bg-cyan-300/20 blur-[100px]" />
    </div>
  );
}

function GeoIcon() {
  return (
    <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-2xl ring-2 ring-teal-400"
        initial={{ opacity: 0.8, scale: 1 }}
        animate={{ opacity: 0, scale: 1.8 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
      />
      <MapPin size={24} strokeWidth={2.5} />
    </div>
  );
}

function StepCard({
  icon,
  title,
  desc,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/60 p-6 backdrop-blur-xl transition-all hover:shadow-xl hover:border-teal-200/50 hover:-translate-y-1"
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-teal-600 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors">{title}</h3>
          <p className="text-sm leading-relaxed text-slate-600 mt-2">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function IntroPage() {
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: stickyRef, offset: ["start end", "end start"] });

  const y = useSpring(useTransform(scrollYProgress, [0, 1], [50, -100]), { stiffness: 60, damping: 20 });
  const rotate = useTransform(scrollYProgress, [0, 1], [2, -2]);
  const scale = useTransform(scrollYProgress, [0.2, 0.8], [0.95, 1]);

  return (
    <div className="relative min-h-screen w-full text-slate-900 selection:bg-teal-200 selection:text-teal-900">
      <BackgroundBlobs />

      {/* NAV SIMPLES - Removido Login, agora é só Branding e botão de ação */}
      <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-900">
          <div className="w-8 h-8 bg-gradient-to-tr from-teal-500 to-sky-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">PF</div>
          PraiaFinder
        </div>
        <Link href={APP_PATH} className="text-sm font-semibold text-slate-600 hover:text-teal-600 transition-colors">
          Abrir App
        </Link>
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 overflow-hidden">
        <div className="mx-auto max-w-5xl text-center">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium text-teal-700 ring-1 ring-teal-500/20 shadow-sm backdrop-blur-md mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </span>
            Previsões atualizadas a cada hora
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-7xl font-extrabold tracking-tight text-slate-900 mb-6"
          >
            A tua praia perfeita <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-600">
              sem surpresas.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed"
          >
            O tempo em Portugal é instável. Nós analisamos o <span className="font-semibold text-slate-900">vento, ondulação e temperatura</span> para te dizer exatamente onde estender a toalha.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href={APP_PATH}
              className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-8 font-medium text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-slate-800 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              <span className="mr-2">Começar Agora</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center justify-center rounded-full px-8 font-medium text-slate-600 ring-1 ring-slate-200 bg-white/50 hover:bg-white hover:ring-slate-300 transition-all backdrop-blur-sm"
            >
              Como funciona
            </a>
          </motion.div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-4 grid gap-16 lg:grid-cols-2 items-start">

          {/* Coluna Esquerda: Texto Realista */}
          <div className="space-y-8 lg:sticky lg:top-32">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
                Adeus, vento na cara. <br />
                <span className="text-teal-600">Olá, dia perfeito.</span>
              </h2>
              <p className="text-lg text-slate-600">
                Escolhe o teu modo (Família ou Surf) e nós tratamos da matemática meteorológica complexa.
              </p>
            </div>

            <div className="grid gap-4">
              <StepCard
                index={0}
                icon={<GeoIcon />}
                title="Perto ou Longe"
                desc="Vê as melhores praias à tua volta ou planeia uma viagem para o Algarve ou Norte."
              />
              <StepCard
                index={1}
                icon={<div className="p-3 rounded-xl bg-sky-100 text-sky-600"><Navigation size={24} /></div>}
                title="Score Inteligente (0-10)"
                desc="Um número simples que resume tudo. Se estiver verde, vai. Se estiver vermelho, fica em casa."
              />
              <StepCard
                index={2}
                icon={<div className="p-3 rounded-xl bg-indigo-100 text-indigo-600"><Filter size={24} /></div>}
                title="Modo Surf vs Família"
                desc="Ondas grandes são más para crianças, mas ótimas para surfistas. Nós distinguimos os dois."
              />
              <StepCard
                index={3}
                icon={<div className="p-3 rounded-xl bg-amber-100 text-amber-600"><Wind size={24} /></div>}
                title="Fator Vento Offshore"
                desc="Sabemos se a praia está protegida do vento. Nunca mais comas areia sem necessidade."
              />
            </div>
          </div>

          {/* Coluna Direita: Mockup Atualizado */}
          <div ref={stickyRef} className="relative lg:h-[120vh] flex items-start justify-center lg:justify-end pt-10 lg:pt-0">
            <div className="sticky top-24 w-full max-w-[380px]">
              <motion.div
                style={{ y, rotate, scale }}
                className="relative z-10 mx-auto"
              >
                <div className="relative rounded-[3rem] bg-slate-900 p-3 shadow-2xl shadow-teal-900/20 ring-1 ring-black">
                  <div className="absolute top-0 left-1/2 h-6 w-1/3 -translate-x-1/2 rounded-b-xl bg-black z-20"></div>

                  <div className="relative h-[720px] w-full overflow-hidden rounded-[2.25rem] bg-slate-50 flex flex-col">

                    {/* Header App Mockup */}
                    <div className="bg-gradient-to-b from-teal-600 to-teal-700 px-6 pt-12 pb-6 text-white rounded-b-[2rem] shadow-lg z-10">
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-lg border border-white/30">
                            PF
                          </div>
                          <div>
                            <div className="text-xs font-medium text-teal-100 uppercase tracking-wider">Modo Família</div>
                            <div className="font-bold text-lg">Melhores praias hoje</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        <div className="shrink-0 bg-white text-teal-800 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm">Zona Centro</div>
                        <div className="shrink-0 bg-teal-800/50 text-white px-4 py-1.5 rounded-full text-xs border border-white/10">Lisboa</div>
                      </div>
                    </div>

                    {/* Lista Mockup - Dados Realistas */}
                    <div className="flex-1 overflow-hidden p-4 space-y-3 relative">
                      <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-slate-50 to-transparent z-10" />

                      {[
                        { name: "São Martinho", score: 9.2, dist: "12km", tag: "Baía Protegida" },
                        { name: "Nazaré", score: 6.5, dist: "2km", tag: "Vento Forte" },
                        { name: "Foz do Arelho", score: 8.1, dist: "18km", tag: "Lagoa Quente" },
                        { name: "Baleal Norte", score: 4.2, dist: "22km", tag: "Muito Vento" },
                      ].map((beach, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group"
                        >
                          <div>
                            <div className="font-bold text-slate-800">{beach.name}</div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                              <span>{beach.dist}</span> • <span className="text-teal-600 font-medium">{beach.tag}</span>
                            </div>
                          </div>
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm ${beach.score > 8 ? 'bg-teal-100 text-teal-700' : beach.score > 5 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                            {beach.score}
                          </div>
                        </motion.div>
                      ))}

                      {/* Card Destaque: Condições */}
                      <div className="mt-6 p-4 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl">
                        <div className="flex justify-between items-start mb-6">
                          <span className="bg-white/20 px-2 py-1 rounded-lg text-[10px] font-bold backdrop-blur-sm">DETALHE</span>
                          <Wind size={16} className="text-sky-400" />
                        </div>
                        <div className="text-xl font-bold">Vento Offshore</div>
                        <p className="text-slate-400 text-xs mt-1">O vento sopra de terra para o mar, alisando a água e afastando a areia.</p>

                        <div className="mt-4 flex gap-2 text-xs">
                          <div className="bg-white/10 px-2 py-1 rounded">💨 15km/h</div>
                          <div className="bg-white/10 px-2 py-1 rounded">🌊 0.5m</div>
                          <div className="bg-white/10 px-2 py-1 rounded">🌡️ 22ºC</div>
                        </div>
                      </div>

                    </div>

                    {/* Bottom Bar simples */}
                    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 pb-8 flex justify-around text-slate-400">
                      <div className="text-teal-600"><MapPin size={24} /></div>
                      <div className="hover:text-teal-600"><Waves size={24} /></div>
                    </div>
                  </div>
                </div>
                <div className="absolute -inset-4 -z-10 bg-gradient-to-tr from-teal-500 to-sky-500 opacity-20 blur-3xl rounded-full" />
              </motion.div>
            </div>
          </div>
        </div>

      </section>

      {/* CTA FINAL */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="mx-auto max-w-4xl relative z-10">
          <div className="rounded-[3rem] bg-slate-900 p-8 md:p-12 md:text-center overflow-hidden relative shadow-2xl shadow-slate-900/30">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-teal-900/50 via-slate-900 to-slate-900 z-0" />

            <div className="relative z-10 flex flex-col md:items-center gap-6">
              <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Pronto para ir à praia?
              </h3>
              <p className="text-slate-400 max-w-lg mx-auto text-lg">
                Sem registos, sem complicações. Apenas os melhores spots para hoje.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
                <Link href={APP_PATH} className="inline-flex items-center justify-center rounded-full bg-teal-500 px-8 py-4 text-white font-bold hover:bg-teal-400 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/25">
                  Ver Praias Agora
                </Link>
              </div>

              <div className="pt-8 flex items-center gap-4 text-sm text-slate-500">
                <div className="flex items-center gap-1">
                  <CheckCircle2 size={16} className="text-teal-500" /> 100% Grátis
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 size={16} className="text-teal-500" /> Open Source
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}