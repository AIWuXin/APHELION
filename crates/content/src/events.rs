//! Event presentation table. Index must match `oc_protocol::snapshot::EVENT_*`.

/// One row of the event table.
pub struct EventRow {
    /// Stable kebab-case key.
    pub key: &'static str,
    /// Log template; `{a}` / `{b}` are substituted with the event args.
    pub text_zh: &'static str,
    /// Subtitle speaker tag (empty = no subtitle).
    pub speaker: &'static str,
    /// 0 info, 1 warn, 2 danger, 3 good.
    pub tone: u8,
}

/// Info tone.
pub const TONE_INFO: u8 = 0;
/// Warning tone.
pub const TONE_WARN: u8 = 1;
/// Danger tone.
pub const TONE_DANGER: u8 = 2;
/// Positive tone.
pub const TONE_GOOD: u8 = 3;

/// The table.
pub static EVENTS: &[EventRow] = &[
    EventRow {
        key: "build-done",
        text_zh: "{a} 建成",
        speaker: "",
        tone: TONE_INFO,
    },
    EventRow {
        key: "produced",
        text_zh: "产线交付 {a} 单位",
        speaker: "",
        tone: TONE_INFO,
    },
    EventRow {
        key: "launch",
        text_zh: "点火确认，发射台 {a} 已释放载荷",
        speaker: "PAD-02",
        tone: TONE_GOOD,
    },
    EventRow {
        key: "orbit",
        text_zh: "载荷入轨，轨道运力 +{a}",
        speaker: "PAD-02",
        tone: TONE_GOOD,
    },
    EventRow {
        key: "route",
        text_zh: "航线结算：合金 +{a} / 研究 +{b}",
        speaker: "LOGISTICS",
        tone: TONE_GOOD,
    },
    EventRow {
        key: "wave",
        text_zh: "第 {a} 波敌舰脱离跃迁点，预计 {b} 秒后接触",
        speaker: "TACTICAL",
        tone: TONE_DANGER,
    },
    EventRow {
        key: "drop",
        text_zh: "登陆艇突破外层防御，落点已标注",
        speaker: "TACTICAL",
        tone: TONE_DANGER,
    },
    EventRow {
        key: "damage",
        text_zh: "{a} 正在承受火力",
        speaker: "STRUCTURAL",
        tone: TONE_WARN,
    },
    EventRow {
        key: "kill",
        text_zh: "目标清除，战果 +{a}",
        speaker: "TACTICAL",
        tone: TONE_GOOD,
    },
    EventRow {
        key: "research",
        text_zh: "研究完成：{a}",
        speaker: "SCIENCE",
        tone: TONE_GOOD,
    },
    EventRow {
        key: "power",
        text_zh: "电力赤字 {a}，部分产线停摆",
        speaker: "GRID",
        tone: TONE_WARN,
    },
    EventRow {
        key: "shortage",
        text_zh: "合金不足，建造队列等待",
        speaker: "LOGISTICS",
        tone: TONE_WARN,
    },
    EventRow {
        key: "end",
        text_zh: "战役结束：{a}",
        speaker: "COMMAND",
        tone: TONE_DANGER,
    },
    EventRow {
        key: "raid",
        text_zh: "地面掠袭纵队在殖民地外围环带集结，正在逼近",
        speaker: "TACTICAL",
        tone: TONE_DANGER,
    },
];

/// Convert a row to the wire definition.
#[must_use]
pub fn to_def(r: &EventRow) -> oc_protocol::EventDef {
    oc_protocol::EventDef {
        key: r.key.to_owned(),
        text_zh: r.text_zh.to_owned(),
        speaker: r.speaker.to_owned(),
        tone: r.tone,
    }
}
