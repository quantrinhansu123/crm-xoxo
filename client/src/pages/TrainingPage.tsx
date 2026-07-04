export function TrainingPage() {
  return (
    <div className="h-[calc(100vh-8.5rem)] min-h-[600px] w-full overflow-hidden rounded-xl border bg-white">
      <iframe
        src="https://tuyen-dung-steel.vercel.app/training"
        title="Đào tạo"
        className="h-full w-full border-0"
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
}
