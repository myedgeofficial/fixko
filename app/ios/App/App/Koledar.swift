import Foundation
import Capacitor
import EventKit

// Termin dela v Apple koledar (z opozorilom uro prej) in v Opomnike.
@objc(FixkoKoledarPlugin)
public class FixkoKoledarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FixkoKoledarPlugin"
    public let jsName = "FixkoKoledar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "dodaj", returnType: CAPPluginReturnPromise)
    ]
    private let store = EKEventStore()

    @objc func dodaj(_ call: CAPPluginCall) {
        guard let ms = call.getDouble("zacetek"), let naslov = call.getString("naslov") else {
            call.reject("Manjka termin")
            return
        }
        let opis = call.getString("opis") ?? ""
        let kraj = call.getString("kraj") ?? ""
        let zacetek = Date(timeIntervalSince1970: ms / 1000)
        let store = self.store
        Task {
            var koledar = false
            var opomnik = false
            do {
                let ok = try await store.requestWriteOnlyAccessToEvents()
                if ok, let cal = store.defaultCalendarForNewEvents {
                    let e = EKEvent(eventStore: store)
                    e.title = naslov
                    e.notes = opis
                    e.location = kraj
                    e.startDate = zacetek
                    e.endDate = zacetek.addingTimeInterval(3600)
                    e.calendar = cal
                    e.addAlarm(EKAlarm(relativeOffset: -3600))
                    try store.save(e, span: .thisEvent)
                    koledar = true
                }
            } catch {}
            do {
                let ok = try await store.requestFullAccessToReminders()
                if ok, let cal = store.defaultCalendarForNewReminders() {
                    let r = EKReminder(eventStore: store)
                    r.title = naslov
                    r.notes = [opis, kraj].filter { !$0.isEmpty }.joined(separator: "\n")
                    r.calendar = cal
                    r.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: zacetek)
                    r.addAlarm(EKAlarm(absoluteDate: zacetek.addingTimeInterval(-3600)))
                    try store.save(r, commit: true)
                    opomnik = true
                }
            } catch {}
            call.resolve(["koledar": koledar, "opomnik": opomnik])
        }
    }
}
