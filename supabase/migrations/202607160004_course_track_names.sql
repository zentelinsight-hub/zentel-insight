with track_names (
  program_slug,
  old_name,
  new_name,
  level_description
) as (
  values
    ('graphic-design', 'Beginner', 'Design Foundations', 'Core layout, colour, typography and visual-composition practice.'),
    ('graphic-design', 'Intermediate', 'Brand and Social Media Design', 'Practical brand assets and platform-ready creative content.'),
    ('graphic-design', 'Advanced', 'Visual Identity and Professional Portfolio', 'Portfolio-focused identity systems and presentation work.'),
    ('web-design-and-development', 'Beginner', 'Web Foundations', 'HTML, CSS, responsive layout and web publishing foundations.'),
    ('web-design-and-development', 'Intermediate', 'Frontend Development', 'JavaScript, accessibility, Git and interactive frontend practice.'),
    ('web-design-and-development', 'Advanced', 'Full-Stack Web Applications', 'React, APIs, Supabase-backed data and deployment workflow.'),
    ('software-development', 'Beginner', 'Programming Foundations', 'Programming logic, syntax, debugging and small exercises.'),
    ('software-development', 'Intermediate', 'Application Development', 'Data, APIs, project structure and application workflows.'),
    ('software-development', 'Advanced', 'Software Engineering Practice', 'Testing, architecture, versioning and deployment readiness.'),
    ('video-editing', 'Beginner', 'Video Editing Essentials', 'Timeline editing, clips, audio basics and clean exports.'),
    ('video-editing', 'Intermediate', 'Professional Editing and Storytelling', 'Narrative rhythm, captions, colour and platform-ready delivery.'),
    ('video-editing', 'Advanced', 'Motion Graphics and Commercial Production', 'Motion elements and campaign-style video projects.'),
    ('python-programming', 'Beginner', 'Python Foundations', 'Syntax, control flow, functions and beginner exercises.'),
    ('python-programming', 'Intermediate', 'Automation, Data and APIs', 'Useful scripts, files, data handling and API calls.'),
    ('python-programming', 'Advanced', 'Python Application Development', 'Structured apps with Flask or FastAPI where appropriate.'),
    ('digital-marketing', 'Beginner', 'Digital Marketing Foundations', 'Audience, channels, content planning and responsible marketing basics.'),
    ('digital-marketing', 'Intermediate', 'Campaigns, Content and Advertising', 'Campaign setup, ad planning, email and content workflows.'),
    ('digital-marketing', 'Advanced', 'Analytics and Growth Strategy', 'Measurement, reporting and strategy improvement practice.'),
    ('affiliate-marketing', 'Beginner', 'Affiliate Marketing Starter', 'Foundations, disclosure, audience fit and responsible promotion.'),
    ('affiliate-marketing', 'Intermediate', 'Campaign and Funnel Building', 'Content flow, landing pages, email basics and conversion planning.'),
    ('affiliate-marketing', 'Advanced', 'Optimization and Ethical Scaling', 'Measurement, testing and responsible improvement habits.'),
    ('business-management', 'Beginner', 'Business Essentials', 'Business structure, customers, offers and planning basics.'),
    ('business-management', 'Intermediate', 'Operations, Finance and Customer Management', 'Organizing work, tracking money and serving customers.'),
    ('business-management', 'Advanced', 'Strategy, Leadership and Business Growth', 'Decision-making, team habits and growth planning.'),
    ('data-analysis', 'Beginner', 'Excel Data Essentials', 'Spreadsheets, cleaning, formulas, charts and business reporting.'),
    ('data-analysis', 'Intermediate', 'SQL and Power BI Analysis', 'Querying data and building decision-ready dashboards.'),
    ('data-analysis', 'Advanced', 'Python Analytics and Portfolio Projects', 'Python notebooks, analysis workflows and portfolio evidence.'),
    ('ui-ux-design', 'Beginner', 'UX and Interface Foundations', 'User flows, layout, wireframes and usability basics.'),
    ('ui-ux-design', 'Intermediate', 'Product Design and Interactive Prototyping', 'Figma prototyping, product screens and critique practice.'),
    ('ui-ux-design', 'Advanced', 'Design Systems and Professional Portfolio', 'Reusable components, documentation and portfolio presentation.'),
    ('mobile-app-development', 'Beginner', 'Mobile Development Foundations', 'Dart basics, mobile UI and development setup.'),
    ('mobile-app-development', 'Intermediate', 'Cross-Platform Application Development', 'Flutter screens, navigation, state and local data.'),
    ('mobile-app-development', 'Advanced', 'Production Apps, APIs and Deployment', 'API-backed app flows and release-readiness concepts.'),
    ('cybersecurity-basics', 'Beginner', 'Cybersecurity Foundations', 'Digital safety, security concepts, ethics and defensive thinking.'),
    ('cybersecurity-basics', 'Intermediate', 'Network and Endpoint Security', 'Network basics, endpoint risks and authorized lab observation.'),
    ('cybersecurity-basics', 'Advanced', 'Junior Security Analyst Track', 'Monitoring concepts, reporting and defensive workflow practice.'),
    ('virtual-assistance', 'Beginner', 'Virtual Assistant Essentials', 'Communication, scheduling and remote-work foundations.'),
    ('virtual-assistance', 'Intermediate', 'Executive and Digital Operations', 'Client support, tools and organized digital workflows.'),
    ('virtual-assistance', 'Advanced', 'Specialized Technical Virtual Assistance', 'Technical support workflows and service packaging.'),
    ('content-creation', 'Beginner', 'Content Creation Foundations', 'Audience clarity, planning and basic content production.'),
    ('content-creation', 'Intermediate', 'Video and Social Content Production', 'Practical video, graphics and platform-ready publishing.'),
    ('content-creation', 'Advanced', 'Content Strategy and Brand Growth', 'Content systems, analytics and brand consistency.'),
    ('cv-professional-portfolio-development', 'Beginner', 'Career Starter Package', 'CV structure, clearer wording and application-readiness basics.'),
    ('cv-professional-portfolio-development', 'Intermediate', 'Professional Branding Package', 'CV, LinkedIn guidance and professional positioning.'),
    ('cv-professional-portfolio-development', 'Advanced', 'Technology Portfolio Package', 'Portfolio presentation, project framing and technology-profile polish.')
)
update public.program_levels
set
  level_name = track_names.new_name,
  level_description = track_names.level_description,
  updated_at = now()
from track_names
join public.programs on programs.slug = track_names.program_slug
where program_levels.program_id = programs.id
  and program_levels.level_name = track_names.old_name;
