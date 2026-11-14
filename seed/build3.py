import json
def ch(section, site='', feed='', term='', kind=None):
    c = {"section": section, "site": site, "guess": False}
    if feed: c["feed"] = feed
    if term: c["term"] = term
    if kind: c["kind"] = kind
    return c
S = lambda site, feed='': ch("substack", site, feed)
P = lambda term, feed='', site='': ch("podcast", site, feed, term)
Y = lambda url: ch("vlog", url)
V = []
def v(name, bio, topics, tag, web, chans, src="Batch 3 research, Nov 2026"):
    V.append({"name": name, "short_bio": bio[:300], "topics": topics, "position_tag": tag, "website": web, "channels": chans, "source": src})
# Newsletters
v("Future of Jewish","Daily newsletter on Judaism and Israel by Joshua Hoffman, Tel Aviv based.",["news","culture"],"center-right","https://www.futureofjewish.com",[S("https://www.futureofjewish.com","https://www.futureofjewish.com/feed")])
v("Uri Kurlianchik","Israeli author who writes daily on war, history and politics.",["politics","history"],"right","https://urikurlianchik.substack.com",[S("https://urikurlianchik.substack.com","https://urikurlianchik.substack.com/feed")])
v("Fisch Files","Eitan Fischberger, pro-Israel creator and Daily Wire contributor.",["advocacy","media"],"right","https://fischfiles.substack.com",[S("https://fischfiles.substack.com","https://fischfiles.substack.com/feed")])
v("Weekly Zionist","Z3 Project weekly reader on renewing Zionism and Jewish peoplehood.",["zionism"],"center","https://weeklyzionist.substack.com",[S("https://weeklyzionist.substack.com","https://weeklyzionist.substack.com/feed")])
v("Dena Tauber, As a Jew","New York attorney writing on Israel and Zionism.",["zionism","advocacy"],"center","https://denacohen.substack.com",[S("https://denacohen.substack.com","https://denacohen.substack.com/feed")])
v("The New Zionist Times","Bob Goldberg, twice weekly newsletter on resurgent Zionism.",["zionism"],"center-right","https://thenewzionisttimes.substack.com",[S("https://thenewzionisttimes.substack.com","https://thenewzionisttimes.substack.com/feed")])
v("The Zionist Voice","Ted Goldstein and Liza Libes on Israel, antisemitism and the new Zionism.",["zionism","antisemitism"],"right","https://thezionistvoice.substack.com",[S("https://thezionistvoice.substack.com")])
v("Zionism Today","Newsletter formerly called Voice of Zion, defending Israel.",["zionism","advocacy"],"right","https://www.zionismtoday.com",[S("https://www.zionismtoday.com","https://www.zionismtoday.com/feed")])
v("Judy Lev, Epistles from Israel","Weekly letter from Israel on life beyond the missiles.",["society"],"center","https://judylabensohn.substack.com",[S("https://judylabensohn.substack.com","https://judylabensohn.substack.com/feed")])
v("Israel-is-Incredible","Winston Siegel on Israeli technology, medicine and agriculture.",["innovation"],"center","https://winstonsiegel.substack.com",[S("https://winstonsiegel.substack.com","https://winstonsiegel.substack.com/feed")])
v("The Salty Zionist","Yitzhak Santis argues for an honest Zionism that can take criticism.",["zionism"],"center-left","https://saltyzionist.substack.com",[S("https://saltyzionist.substack.com","https://saltyzionist.substack.com/feed")])
v("Noted by Nemo","Nemo Shiff, weekly comic look at loud times.",["culture"],"center","https://notedbynemo.substack.com",[S("https://notedbynemo.substack.com")])
# Podcasts
v("Unpacking Israeli History","Dr. Noam Weissman of OpenDor Media on the history behind the headlines.",["history"],"center","https://unpacked.media/podcast-series/unpacking-israeli-history/",[P("Unpacking Israeli History","https://feeds.megaphone.fm/unpacking-israeli-history")])
v("Chosen People Problems","ChayaLeah Sufrin and Yael Bar Tur on Jewish life and Israel, now with Ark Media.",["culture","community"],"center","https://arkmedia.org",[P("Chosen People Problems")])
v("Israel Update","Gadi Taub and Michael Doran on the war and regional politics.",["politics","security"],"center-right","https://feeds.megaphone.fm/israelupdate",[P("Israel Update","https://feeds.megaphone.fm/israelupdate")])
v("Being Jewish with Jonah Platt","Weekly interviews on Jewish identity and current events.",["culture"],"center","",[P("Being Jewish with Jonah Platt")])
v("Jew Oughta Know","Jason Harris on Jewish and Israeli history.",["history"],"center","",[P("Jew Oughta Know")])
v("The Times of Israel Daily Briefing","Daily roundup of Israel and Jewish world news.",["news"],"center","https://www.timesofisrael.com",[P("The Times of Israel Daily Briefing")])
v("The Jewish People's Podcast","Yaakov Katz of JPPI with experts on Israel and diaspora issues.",["policy"],"center","https://jppi.org.il",[P("The Jewish People's Podcast JPPI")])
v("The Jerusalem Journal Podcast","Avi Mayer on Israel, the Middle East and the Jewish world.",["news","politics"],"center","",[P("The Jerusalem Journal Podcast Avi Mayer")])
v("The Israel Connection","Esti Zenati interviews guests with a personal link to Israel.",["society"],"center","",[P("The Israel Connection Esti Zenati")])
v("Doron Keidar","IDF reservist and security professional defending Israel.",["security","advocacy"],"right","",[P("Doron Keidar Podcast")])
v("Yishai Fleisher Israel Podcast","Long-running English podcast on Israeli life and politics.",["politics","society"],"right","",[P("Yishai Fleisher Israel Podcast","https://rss.buzzsprout.com/1271258.rss")])
v("Boundless Insights with Aviva Klompas","Interviews on Israel and the region.",["politics","diplomacy"],"center","https://www.buzzsprout.com/2411720",[P("Boundless Insights Aviva Klompas","https://feeds.buzzsprout.com/2411720.rss")])
v("Israel's Enduring Spirit","Interviews with advocates and Israelis.",["society","advocacy"],"center","",[P("Israel's Enduring Spirit")])
v("Inspiration for the Nation, Living Lchaim","Yaakov Langer's weekly Jewish podcast and long-form video interviews.",["culture","community"],"center-right","https://www.livinglchaim.com",[P("Inspiration for the Nation with Yaakov Langer"),Y("https://www.youtube.com/@LivingLchaim")])
# Christian friends
v("Proclaiming Justice with Laurie Cardoza-Moore","Christian pro-Israel podcast and TV outlet.",["advocacy","faith"],"right","",[P("Proclaiming Justice to the Nations")])
v("Out of Zion","ICEJ podcast with Susan Michael on Christian support for Israel.",["faith"],"center-right","",[P("Out of Zion Susan Michael")])
v("Pod for Israel","Short biblical insights from Israel by One for Israel.",["faith"],"center-right","",[P("Pod for Israel One for Israel")])
v("The Land of Israel Guys","Christian and Israeli hosts on Israel, faith and settlement life.",["faith","society"],"right","",[P("Land of Israel Guys Eve Harow")])
v("Israel Matters","Stephen Briggs and guests on Israel and the Bible.",["faith"],"center-right","",[P("Israel Matters Stephen Briggs")])
v("Israel365 News","YouTube channel run by Rabbi Tuly Weisz's team, past 100,000 subscribers.",["news","faith"],"right","https://israel365news.com",[Y("https://www.youtube.com/@Israel365News")])
v("Gerald McDermott","Anglican theologian and author of The New Christian Zionism.",["faith"],"center-right","",[])
# Creators with a findable show
v("Emily Austin","Sports broadcaster and host of The Emily Austin Show.",["media","advocacy"],"center-right","",[P("The Emily Austin Show")])
v("Loay Alshareef","Muslim Zionist, linguist and peace advocate with a YouTube channel since 2012.",["peace","advocacy"],"center","",[Y("https://www.youtube.com/@LoayAlshareef")])
json.dump({"voices": V}, open("seed/batch3.json","w"), indent=1, ensure_ascii=False)
print(len(V))
