export default function Loading() {
  return (
    <div className="container page" aria-busy="true">
      <div className="stack">
        <span className="skel" style={{ width: 200, height: 32 }} />
        <div className="apps-stats">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="skel" style={{ height: 72, borderRadius: 14 }} />
          ))}
        </div>
        <span className="skel" style={{ width: "100%", height: 44 }} />
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="skel"
            style={{ width: "100%", height: 56, borderRadius: 14 }}
          />
        ))}
      </div>
    </div>
  )
}
