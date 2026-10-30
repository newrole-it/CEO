export default function Loading() {
  return (
    <div className="container container--narrow page" aria-busy="true">
      <div className="stack">
        <span className="skel" style={{ width: 200, height: 32 }} />
        <span className="skel" style={{ width: 130, height: 40, borderRadius: 10 }} />
        <div className="cvl-grid">
          {[0, 1].map((index) => (
            <span
              key={index}
              className="skel"
              style={{ width: "100%", height: 150, borderRadius: 14 }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
