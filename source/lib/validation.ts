import { z } from "zod";

export const memberProfileSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().min(7, "Enter a valid phone number.").optional().or(z.literal("")),
  studentId: z.string().min(3, "Student ID is required."),
  className: z.string().min(2, "Class or cohort is required."),
  emergencyContact: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000, "Please keep notes under 1000 characters.").optional().or(z.literal("")),
  skills: z.array(z.string()).min(1, "Select at least one skill."),
  availability: z.array(z.string()).min(1, "Select at least one availability slot."),
  projectPreferences: z.array(z.string()).min(1, "Select at least one project preference."),
  profileStatus: z.enum(["active", "inactive", "probation"]).default("active"),
});

export const missionSchema = z.object({
  title: z.string().min(3, "Mission title is required."),
  description: z.string().min(10, "Mission description is required."),
  ownerName: z.string().min(2, "Owner name is required."),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"]),
  dueDate: z.string().datetime().optional().nullable(),
});

export const timetableItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "Event title is required."),
  description: z.string().min(4, "Add a short event description."),
  location: z.string().min(2, "Location is required."),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notifyMembers: z.boolean().default(false),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  position: z.number().int().nonnegative().default(0),
});

export const timetableSchema = z.object({
  items: z.array(timetableItemSchema).min(1, "Add at least one timetable item."),
});

export const aiGroupingSchema = z.object({
  groupCount: z.number().int().min(2).max(12),
  note: z.string().max(500).optional().or(z.literal("")),
  memberIds: z.array(z.string()).optional(),
});

export type MemberProfileInput = z.infer<typeof memberProfileSchema>;
export type MissionInput = z.infer<typeof missionSchema>;
export type TimetableInput = z.infer<typeof timetableSchema>;
export type TimetableItemInput = z.infer<typeof timetableItemSchema>;
export type AiGroupingInput = z.infer<typeof aiGroupingSchema>;
