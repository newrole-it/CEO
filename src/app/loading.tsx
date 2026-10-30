export default function Loading() {
  return (
    <div className="container page" aria-busy="true">
      <div className="stack" style={{ maxWidth: 820 }}>
        <span className="skel" style={{ width: 220, height: 32 }} />
        {[0, 1, 2].map((index) => (
          <span key={index} className="skel" style={{ width: "100%", height: 176, borderRadius: 14 }} />
        ))}
      </div>
    </div>
  )
}
