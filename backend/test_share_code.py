import sys
sys.path.insert(0, '.')
import os
os.environ["DATABASE_URL"]="sqlite:///./test_share.db"
import pathlib
p=pathlib.Path("./test_share.db")
if p.exists(): p.unlink()
import db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
db.engine = create_engine("sqlite:///./test_share.db", connect_args={"check_same_thread": False})
db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)
db.Base.metadata.create_all(bind=db.engine)
import importlib
if 'main' in sys.modules: del sys.modules['main']
import main
main.ensure_migrations()
from fastapi.testclient import TestClient
client=TestClient(main.app)

def test_share_code_flow():
    # register user1
    r=client.post("/api/auth/register", json={"username":"alice","password":"pw123"})
    assert r.status_code==200, r.text
    token1=r.json()["token"]
    h1={"Authorization":"Bearer "+token1}
    # create house
    r=client.post("/api/houses", json={"name":"TestHouse"}, headers=h1)
    assert r.status_code==200, r.text
    hid=r.json()["id"]
    invite=r.json()["invite_code"]
    assert invite and len(invite)==6, f"invite {invite}"
    print(f"[PASS] create house invite={invite}")

    # calendar should return same invite
    import datetime
    today=datetime.datetime.utcnow().date().isoformat()
    r=client.get(f"/api/calendar?house_id={hid}&from={today}&to={today}", headers=h1)
    assert r.status_code==200, r.text
    assert r.json()["house"]["invite_code"]==invite, "calendar invite mismatch"
    print(f"[PASS] calendar invite_code present")

    # get_house should return same
    r=client.get(f"/api/houses/{hid}", headers=h1)
    assert r.status_code==200
    assert r.json()["invite_code"]==invite
    print(f"[PASS] get_house invite_code")

    # list houses should have invite
    r=client.get("/api/houses", headers=h1)
    assert any(h["invite_code"]==invite for h in r.json())
    print(f"[PASS] list houses invite_code")

    # second user joins via invite code
    r=client.post("/api/auth/register", json={"username":"bob","password":"pw123"})
    assert r.status_code==200
    token2=r.json()["token"]
    h2={"Authorization":"Bearer "+token2}
    r=client.post("/api/houses/join", json={"invite_code":invite}, headers=h2)
    assert r.status_code==200, r.text
    assert r.json()["invite_code"]==invite
    print(f"[PASS] join via invite_code")

    # join via house name fallback
    r=client.post("/api/auth/register", json={"username":"carol","password":"pw123"})
    token3=r.json()["token"]
    h3={"Authorization":"Bearer "+token3}
    r=client.post("/api/houses/join", json={"invite_code":"TestHouse"}, headers=h3)
    assert r.status_code==200, r.text
    print(f"[PASS] join via house name fallback")

    # invalid invite should 404
    r=client.post("/api/houses/join", json={"invite_code":"XXXXXX"}, headers=h2)
    assert r.status_code==404
    print(f"[PASS] invalid invite 404")

    # frontend check: house-invite span and copy buttons exist in index.html
    import pathlib as pl
    html=pl.Path("../frontend/index.html").read_text() if pl.Path("../frontend/index.html").exists() else pl.Path("frontend/index.html").read_text()
    try:
        html=pl.Path("frontend/index.html").read_text()
    except:
        html=pl.Path("../frontend/index.html").read_text()
    assert 'id="house-invite"' in html, "house-invite missing"
    assert 'id="settings-invite"' in html, "settings-invite missing"
    assert 'id="copy-invite"' in html, "copy-invite missing"
    assert 'id="copy-house-invite"' in html, "copy-house-invite (header) missing"
    print(f"[PASS] frontend has house-invite, settings-invite, copy-invite, copy-house-invite")

    # check app.js has copy handler and house-invite assignment
    js=pl.Path("frontend/app.js").read_text() if pl.Path("frontend/app.js").exists() else pl.Path("../frontend/app.js").read_text()
    try:
        js=pl.Path("frontend/app.js").read_text()
    except:
        js=pl.Path("../frontend/app.js").read_text()
    assert 'house-invite' in js, "house-invite not in js"
    assert 'copy-invite' in js, "copy-invite not in js"
    assert 'navigator.clipboard.writeText' in js, "clipboard not in js"
    print(f"[PASS] frontend js has copy handler")

    print("\nALL SHARE CODE TESTS PASSED")

if __name__=="__main__":
    test_share_code_flow()
    # cleanup
    import pathlib as pp
    if pp.Path("./test_share.db").exists():
        pp.Path("./test_share.db").unlink()
    if pp.Path("../test_share.db").exists():
        pp.Path("../test_share.db").unlink()
