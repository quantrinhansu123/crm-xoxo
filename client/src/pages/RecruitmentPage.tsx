export function RecruitmentPage() {
  return (
    <div className="h-[calc(100vh-8.5rem)] min-h-[600px] w-full overflow-hidden rounded-xl border bg-white">
      <iframe
        src="https://tuyen-dung-steel.vercel.app/recruitment/candidates"
        title="Tuyển dụng"
        className="h-full w-full border-0"
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
}
