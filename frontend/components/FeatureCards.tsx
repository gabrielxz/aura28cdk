export default function FeatureCards() {
  const features = [
    {
      icon: '🔍',
      title: 'Make the Unconscious Conscious',
      description:
        "Revealing what truly drives you, what holds you back, and what's waiting for you on the other side. Hidden blocks and gifts brought into the light.",
    },
    {
      icon: '⚡',
      title: 'Spirituality Made Practical',
      description:
        "Something you can carry into your day-to-day, whether that's your work, your relationships, or your biggest goals. No fluff, no mystery.",
    },
    {
      icon: '💎',
      title: 'Life-Altering Clarity',
      description:
        "The kind of insight so spot-on you'll wonder how we know you so well. Real, undeniable clarity where soul meets function.",
    },
  ];

  return (
    <section className="z-20 py-24 px-6 max-w-6xl mx-auto bg-transparent">
      <div className="grid md:grid-cols-3 gap-8">
        {features.map((f, idx) => (
          <div
            key={idx}
            className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-8 transition hover:-translate-y-2 hover:border-[#ffb74d]/40"
          >
            <div className="text-4xl mb-4">{f.icon}</div>
            <h3 className="text-xl font-semibold text-[#ffb74d] mb-2">{f.title}</h3>
            <p className="opacity-90 leading-relaxed text-sm">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
