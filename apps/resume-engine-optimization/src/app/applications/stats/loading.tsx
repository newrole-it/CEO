export default function Loading() {
  return (
    <div className="container page" aria-busy="true">
      <div className="stack-lg">
        <div className="stack-sm">
          <span className="skel" style={{ width: 120, height: 16 }} />
          <span className="skel" style={{ width: 200, height: 32 }} />
        </div>
        <div className="stx-kpis">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="skel" style={{ height: 92, borderRadius: 14 }} />
          ))}
        </div>
        <div className="stx-grid">
          <span className="skel" style={{ height: 300, borderRadius: 14 }} />
          <span className="skel" style={{ height: 300, borderRadius: 14 }} />
        </div>
        <span className="skel" style={{ width: "100%", height: 320, borderRadius: 14 }} />
      </div>
    </div>
  )
}
