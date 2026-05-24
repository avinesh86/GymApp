import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Award, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

export default function AIInsights({ events, staff, classTypes, periodFilter }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const completedEvents = events.filter(e => e.status === "completed");
      const instructors = staff.filter(s => s.role === "instructor");

      // Build stats for the prompt
      const instructorStats = instructors.map(ins => {
        const insEvents = completedEvents.filter(e => e.assigned_instructor_id === ins.id);
        const withAtt = insEvents.filter(e => e.attendance_count != null);
        const avgAtt = withAtt.length ? Math.round(withAtt.reduce((s, e) => s + e.attendance_count, 0) / withAtt.length) : 0;
        const byClass = {};
        insEvents.forEach(e => {
          if (!byClass[e.class_type_name]) byClass[e.class_type_name] = [];
          byClass[e.class_type_name].push(e.attendance_count || 0);
        });
        return {
          name: ins.name,
          totalClasses: insEvents.length,
          avgAttendance: avgAtt,
          reliability: ins.cover_reliability_score || 100,
          classesByType: Object.entries(byClass).map(([type, counts]) => ({
            type,
            count: counts.length,
            avg: counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0,
          })),
          viabilityBreakdown: {
            red: insEvents.filter(e => e.viability_color === "red").length,
            amber: insEvents.filter(e => e.viability_color === "amber").length,
            green: insEvents.filter(e => e.viability_color === "green").length,
            purple: insEvents.filter(e => e.viability_color === "purple").length,
          },
        };
      });

      const classTypeStats = classTypes.map(ct => {
        const ctEvents = completedEvents.filter(e => e.class_type_name === ct.name);
        const withAtt = ctEvents.filter(e => e.attendance_count != null);
        const avgAtt = withAtt.length ? Math.round(withAtt.reduce((s, e) => s + e.attendance_count, 0) / withAtt.length) : 0;
        const byDow = {};
        ctEvents.forEach(e => {
          const d = new Date(e.start_datetime).getDay();
          const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          if (!byDow[names[d]]) byDow[names[d]] = [];
          byDow[names[d]].push(e.attendance_count || 0);
        });
        const byHour = {};
        ctEvents.forEach(e => {
          const h = new Date(e.start_datetime).getHours();
          const slot = h < 9 ? "Early Morning" : h < 12 ? "Morning" : h < 14 ? "Lunch" : h < 17 ? "Afternoon" : "Evening";
          if (!byHour[slot]) byHour[slot] = [];
          byHour[slot].push(e.attendance_count || 0);
        });
        return {
          name: ct.name,
          totalSessions: ctEvents.length,
          avgAttendance: avgAtt,
          targets: { red: ct.red_min || 0, amber: ct.amber_min || 5, green: ct.green_min || 10, purple: ct.purple_min || 20 },
          peakDays: Object.entries(byDow).map(([d, v]) => ({ day: d, avg: v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : 0 })).sort((a,b) => b.avg - a.avg),
          peakTimes: Object.entries(byHour).map(([t, v]) => ({ time: t, avg: v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : 0 })).sort((a,b) => b.avg - a.avg),
        };
      });

      const prompt = `You are a fitness studio operations analyst. Analyse this ${periodFilter}-day performance data and provide detailed, actionable insights.

INSTRUCTOR DATA:
${JSON.stringify(instructorStats, null, 2)}

CLASS TYPE DATA:
${JSON.stringify(classTypeStats, null, 2)}

TOTAL EVENTS ANALYSED: ${completedEvents.length}

Please provide a comprehensive analysis covering:
1. Top performing instructors and WHY (specific numbers)
2. Underperforming instructors who need intervention, training or support
3. Best performing class types vs underperforming ones
4. Peak times and days analysis
5. Trend observations (e.g. which class types are growing/declining)
6. Specific recommendations for:
   - Training or upskilling needs
   - Schedule optimisation (best times/days for each class)
   - Instructor interventions (coaching, support, recognition)
   - Class changes (consider removing/adding class types)
   - Reward/recognition for standout performers

Be specific with numbers. Flag both positives and negatives clearly.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2-3 sentence executive summary" },
            positive_trends: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  detail: { type: "string" },
                  metric: { type: "string" },
                  category: { type: "string", enum: ["instructor", "class", "timing", "general"] }
                }
              }
            },
            negative_trends: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  detail: { type: "string" },
                  metric: { type: "string" },
                  category: { type: "string", enum: ["instructor", "class", "timing", "general"] }
                }
              }
            },
            instructor_interventions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  instructor: { type: "string" },
                  action: { type: "string", enum: ["reward", "coaching", "training", "schedule_change", "review"] },
                  reason: { type: "string" },
                  specific_recommendation: { type: "string" }
                }
              }
            },
            class_recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  class_type: { type: "string" },
                  action: { type: "string" },
                  reason: { type: "string" }
                }
              }
            },
            schedule_optimisations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  suggestion: { type: "string" },
                  impact: { type: "string" }
                }
              }
            }
          }
        }
      });

      setInsights(result);
      toast.success("AI analysis complete");
    } catch (e) {
      console.error(e);
      toast.error("AI analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const actionColors = {
    reward: "bg-green-100 text-green-700 border-green-200",
    coaching: "bg-blue-100 text-blue-700 border-blue-200",
    training: "bg-indigo-100 text-indigo-700 border-indigo-200",
    schedule_change: "bg-amber-100 text-amber-700 border-amber-200",
    review: "bg-red-100 text-red-700 border-red-200",
  };

  const actionLabels = {
    reward: "Reward",
    coaching: "Coaching",
    training: "Training",
    schedule_change: "Schedule Change",
    review: "Review",
  };

  const toggle = (s) => setExpandedSection(expandedSection === s ? null : s);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          <p className="text-sm text-indigo-700 font-medium">AI is analysing performance data...</p>
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Sparkles className="w-12 h-12 text-indigo-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">AI Performance Analysis</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
          Get AI-powered insights on instructor performance, class trends, peak times, and personalised recommendations for training, interventions, and rewards.
        </p>
        <p className="text-xs text-amber-600 mb-4">Uses advanced AI model — consumes more integration credits</p>
        <Button onClick={generateInsights} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
          <Sparkles className="w-4 h-4" />
          Generate AI Insights
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <h3 className="font-semibold text-slate-800">AI Performance Analysis</h3>
          <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-200">Last {periodFilter} days</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={generateInsights} className="gap-2">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-sm text-slate-700 leading-relaxed">{insights.summary}</p>
      </div>

      {/* Positive Trends */}
      {insights.positive_trends?.length > 0 && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggle("positive")}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="font-semibold text-slate-800">Positive Trends</span>
              <Badge className="bg-green-100 text-green-700">{insights.positive_trends.length}</Badge>
            </div>
            {expandedSection === "positive" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === "positive" && (
            <div className="px-4 pb-4 space-y-3">
              {insights.positive_trends.map((t, i) => (
                <div key={i} className="p-3 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-green-800 text-sm">{t.title}</p>
                    {t.metric && <Badge className="bg-green-200 text-green-800 text-xs shrink-0">{t.metric}</Badge>}
                  </div>
                  <p className="text-xs text-green-700">{t.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Negative Trends */}
      {insights.negative_trends?.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggle("negative")}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <span className="font-semibold text-slate-800">Areas of Concern</span>
              <Badge className="bg-red-100 text-red-700">{insights.negative_trends.length}</Badge>
            </div>
            {expandedSection === "negative" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === "negative" && (
            <div className="px-4 pb-4 space-y-3">
              {insights.negative_trends.map((t, i) => (
                <div key={i} className="p-3 bg-red-50 rounded-xl border border-red-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-red-800 text-sm">{t.title}</p>
                    {t.metric && <Badge className="bg-red-200 text-red-800 text-xs shrink-0">{t.metric}</Badge>}
                  </div>
                  <p className="text-xs text-red-700">{t.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructor Interventions */}
      {insights.instructor_interventions?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggle("instructors")}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold text-slate-800">Instructor Actions</span>
              <Badge className="bg-indigo-100 text-indigo-700">{insights.instructor_interventions.length}</Badge>
            </div>
            {expandedSection === "instructors" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === "instructors" && (
            <div className="px-4 pb-4 space-y-3">
              {insights.instructor_interventions.map((item, i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-slate-800">{item.instructor}</span>
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${actionColors[item.action] || "bg-slate-100 text-slate-600"}`}>
                      {actionLabels[item.action] || item.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-1">{item.reason}</p>
                  <p className="text-xs text-slate-800 font-medium bg-white rounded-lg p-2 border border-slate-100">
                    Recommendation: {item.specific_recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Class Recommendations */}
      {insights.class_recommendations?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggle("classes")}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="font-semibold text-slate-800">Class Recommendations</span>
              <Badge className="bg-amber-100 text-amber-700">{insights.class_recommendations.length}</Badge>
            </div>
            {expandedSection === "classes" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === "classes" && (
            <div className="px-4 pb-4 space-y-3">
              {insights.class_recommendations.map((c, i) => (
                <div key={i} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="font-semibold text-amber-800 text-sm mb-1">{c.class_type}</p>
                  <p className="text-xs text-amber-700 font-medium mb-1">{c.action}</p>
                  <p className="text-xs text-amber-600">{c.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Optimisations */}
      {insights.schedule_optimisations?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggle("schedule")}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-500" />
              <span className="font-semibold text-slate-800">Schedule Optimisations</span>
              <Badge className="bg-cyan-100 text-cyan-700">{insights.schedule_optimisations.length}</Badge>
            </div>
            {expandedSection === "schedule" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === "schedule" && (
            <div className="px-4 pb-4 space-y-3">
              {insights.schedule_optimisations.map((s, i) => (
                <div key={i} className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
                  <p className="text-sm text-cyan-800 font-medium mb-1">{s.suggestion}</p>
                  <p className="text-xs text-cyan-600">Impact: {s.impact}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}