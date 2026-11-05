export default function Loading() {
  return (
    <div className="container container--narrow page" aria-busy="true">
      <div className="stack">
        <span className="skel" style={{ width: 200, height: 32 }} />
        <span className="skel" style={{ width: 130, height: 40, borderRadius: 10 }} />
        <div className="card cvl-list">
          {[0, 1, 2].map((index) => (
            <div key={index} className="cvl-row">
              <span className="skel" style={{ width: 36, height: 36, borderRadius: 10 }} />
              <span className="skel" style={{ width: "60%", height: 16 }} />
              <span className="skel" style={{ width: 140, height: 32, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
