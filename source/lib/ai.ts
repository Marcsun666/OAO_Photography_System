import { db } from "@/lib/db";
        import { demoMembers } from "@/lib/demo";
        import { env } from "@/lib/env";
        import { logger } from "@/lib/logger";
        import type { AiGroupingInput } from "@/lib/validation";

        const limiter = new Map<string, { count: number; resetAt: number }>();

        function applyRateLimit(key: string, max = 10, windowMs = 60_000) {
          const now = Date.now();
          const bucket = limiter.get(key);
          if (!bucket || bucket.resetAt < now) {
            limiter.set(key, { count: 1, resetAt: now + windowMs });
            return;
          }
          if (bucket.count >= max) {
            throw new Error("Rate limit exceeded for AI requests. Please retry shortly.");
          }
          bucket.count += 1;
        }

        async function retry<T>(task: () => Promise<T>, retries = 2) {
          let lastError: unknown;
          for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
              return await task();
            } catch (error) {
              lastError = error;
              await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
            }
          }
          throw lastError;
        }

        function buildPrompt(members: Array<Record<string, unknown>>, input: AiGroupingInput) {
          return [
            "You are helping a photography club create balanced project groups.",
            `Create exactly ${input.groupCount} groups.`,
            "Use skills, availability, and project preferences to maximize coverage diversity.",
            input.note ? `Additional guidance: ${input.note}` : "",
            "Return strict JSON in the shape {"groups":[{"name":"Group 1","members":["Name"],"reason":"..."}]}",
            JSON.stringify(members, null, 2),
          ]
            .filter(Boolean)
            .join("

");
        }

        function normalizeMembers(members: Array<Record<string, unknown>>) {
          return members.map((member) => ({
            id: String(member.id),
            fullName: String(member.fullName),
            skills: Array.isArray(member.skills) ? member.skills : [],
            availability: Array.isArray(member.availability) ? member.availability : [],
            projectPreferences: Array.isArray(member.projectPreferences) ? member.projectPreferences : [],
          }));
        }

        function fallbackGrouping(members: Array<Record<string, unknown>>, groupCount: number) {
          const groups = Array.from({ length: groupCount }, (_, index) => ({
            name: `Group ${index + 1}`,
            members: [] as string[],
            reason: "Fallback mode: balanced round-robin distribution used because the AI provider was unavailable.",
          }));

          const sorted = [...members].sort((a, b) => {
            const aScore = (Array.isArray(a.skills) ? a.skills.length : 0) + (Array.isArray(a.projectPreferences) ? a.projectPreferences.length : 0);
            const bScore = (Array.isArray(b.skills) ? b.skills.length : 0) + (Array.isArray(b.projectPreferences) ? b.projectPreferences.length : 0);
            return bScore - aScore;
          });

          sorted.forEach((member, index) => {
            groups[index % groupCount].members.push(String(member.fullName));
          });

          return groups;
        }

        async function callProvider(prompt: string) {
          if (env.aiProvider === "openai" && env.openAiApiKey) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.openAiApiKey}`,
              },
              body: JSON.stringify({
                model: env.aiModel,
                temperature: 0.2,
                response_format: { type: "json_object" },
                messages: [{ role: "user", content: prompt }],
              }),
            });
            if (!response.ok) {
              throw new Error(`OpenAI request failed with ${response.status}`);
            }
            const json = await response.json();
            return String(json.choices?.[0]?.message?.content ?? "");
          }

          if (env.aiProvider === "anthropic" && env.anthropicApiKey) {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": env.anthropicApiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: env.aiModel,
                max_tokens: 1500,
                messages: [{ role: "user", content: prompt }],
              }),
            });
            if (!response.ok) {
              throw new Error(`Anthropic request failed with ${response.status}`);
            }
            const json = await response.json();
            return String(json.content?.[0]?.text ?? "");
          }

          throw new Error("AI provider not configured.");
        }

        function parseGroups(raw: string) {
          const trimmed = raw.replace(/^```json/i, "").replace(/```$/i, "").trim();
          const start = trimmed.indexOf("{");
          const end = trimmed.lastIndexOf("}");
          const payload = JSON.parse(trimmed.slice(start, end + 1));
          if (!Array.isArray(payload.groups)) {
            throw new Error("AI response did not include a groups array.");
          }
          return payload.groups;
        }

        export async function runGrouping(input: AiGroupingInput, requesterId: string) {
          applyRateLimit(requesterId);

          const rows = await db.memberProfile.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []);
          const members = rows.length
            ? rows.map((row) => ({
                id: row.id,
                fullName: row.displayNamePreview,
                skills: row.skills as string[],
                availability: row.availability as string[],
                projectPreferences: row.projectPreferences as string[],
              }))
            : demoMembers.map((member) => ({
                id: member.id,
                fullName: member.fullName,
                skills: member.skills,
                availability: member.availability,
                projectPreferences: member.projectPreferences,
              }));

          const normalized = normalizeMembers(members);
          const selected = input.memberIds?.length
            ? normalized.filter((member) => input.memberIds?.includes(member.id))
            : normalized;

          if (selected.length < input.groupCount) {
            throw new Error(`Need at least ${input.groupCount} members to create ${input.groupCount} groups.`);
          }

          const prompt = buildPrompt(selected, input);
          let groups: Array<Record<string, unknown>> = [];
          let fallbackUsed = false;
          let sourceModel = env.aiProvider;

          try {
            const raw = await retry(() => callProvider(prompt));
            groups = parseGroups(raw);
          } catch (error) {
            fallbackUsed = true;
            sourceModel = "fallback";
            logger.warn({ error }, "AI grouping fell back to deterministic grouping");
            groups = fallbackGrouping(selected, input.groupCount);
          }

          const saved = await db.aiGroupingResult.create({
            data: {
              requestedBy: requesterId,
              sourceModel,
              promptVersion: "v1",
              fallbackUsed,
              inputSnapshot: { members: selected, input },
              result: groups,
            },
          }).catch(() => null);

          return {
            id: saved?.id ?? `demo-${Date.now()}`,
            groups,
            fallbackUsed,
            sourceModel,
          };
        }
