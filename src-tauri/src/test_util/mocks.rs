use std::collections::VecDeque;

use anyhow::Result;
use parking_lot::Mutex;
use serde::Serialize;

use crate::interface::events::{EmitEvent, Event};
use crate::util::same_enum_variant;

fn parse_object(json: serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    if let serde_json::value::Value::Object(payload) = json {
        payload
    } else {
        panic!("Unexpected payload type")
    }
}

pub struct MockEventEmitter {
    pub calls: Mutex<VecDeque<(Event, serde_json::Value)>>,
}

impl MockEventEmitter {
    pub fn new() -> Self {
        Self { calls: Mutex::new(VecDeque::new()) }
    }

    pub fn pop_event(&self, event_type: &Event) -> serde_json::Map<String, serde_json::Value> {
        let (event, payload) = self.calls.lock().pop_front().unwrap();
        assert!(same_enum_variant(&event, event_type));
        parse_object(payload)
    }

    pub fn pop_until(&self, event_type: &Event) -> serde_json::Map<String, serde_json::Value> {
        loop {
            let (event, payload) = self.calls.lock().pop_front().unwrap();
            if same_enum_variant(&event, event_type) {
                return parse_object(payload);
            }
        }
    }
}

impl EmitEvent for MockEventEmitter {
    fn emit<S: Serialize + Clone>(&self, event: Event, payload: S) -> Result<()> {
        self.calls.lock().push_back((event, serde_json::to_value(&payload)?));
        Ok(())
    }
}
